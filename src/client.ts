// The Crate client (SDD §3) — targets crate /api/v2 (cluster-first, 2.0.0). A thin, typed
// surface over the shared transport: every method builds a small request spec and delegates
// to http.ts. Conveniences (resolve/artist/label) add the SDK's earned logic; everything
// else is a 1:1 typed wrapper. Designed for AI-agent ergonomics (ADX-1..10): forgiving
// inputs, default-rich one-round-trip dossiers (?fields= only trims), teaching errors,
// JSON-safe failures, a self-describing surface.
import { CrateNotFoundError, CrateValidationError } from './errors';
import { type HttpConfig, type QueryValue, request, type RequestSpec } from './http';
import {
  assertNonEmptyKey,
  classifyArtistKey,
  classifyResolveString,
  type ResolveQuery,
  resolveQueryToParam,
} from './identity';
import type {
  ApiRootIndex,
  ArtistBandcampReleaseResponse,
  ArtistMasterResponse,
  ArtistBrowseParams,
  ArtistBrowseResponse,
  ArtistDossierContract,
  AuraArtistResponse,
  AuraIndexResponse,
  BreakoutsResponse,
  DossierManifest,
  FacetCounts,
  FestivalDossierContract,
  IdentityResolution,
  LabelDossierContract,
  ObservedBeaconRequest,
  OnesToWatchResponse,
  RefinedBeaconRequest,
  SearchParams,
  SearchResponse,
  SurfaceIndexResponse,
  SurfaceName,
  SurfaceParams,
  SurfaceRowsResponse,
  TastemakersResponse,
} from './types';

const DEFAULT_BASE_URL = 'https://crate.hosaka.fm';

export interface CrateOptions {
  /** Customer API key → `X-API-Key`. Required for every data endpoint (crate is key-first); only `crate.index()` is keyless. */
  apiKey?: string;
  /** API origin (no path). Default `https://crate.hosaka.fm`. */
  baseUrl?: string;
  /** Injectable fetch (tests / custom agents). Defaults to the global `fetch` (Node 18+). */
  fetch?: typeof globalThis.fetch;
  /** Per-attempt timeout, ms. Default 30000. */
  timeout?: number;
  /** Max retries (not total sends). Default 2. 0 disables. */
  maxRetries?: number;
  /** Jitter cap for backoff, ms. Default 8000. */
  maxBackoffMs?: number;
  /** Clamp on a server-directed `Retry-After`, ms. Default 60000. */
  maxRetryAfterMs?: number;
  /** Whole-call budget across retries, ms. Default 120000; `null` to disable. */
  totalDeadlineMs?: number | null;
  /** Extra default headers (merged UNDER SDK-managed headers). */
  headers?: Record<string, string>;
}

/** Per-call overrides of the retry/timeout knobs, plus an `AbortSignal` and the `?fields=` trim. */
export interface RequestOptions {
  signal?: AbortSignal;
  timeout?: number;
  maxRetries?: number;
  maxBackoffMs?: number;
  maxRetryAfterMs?: number;
  totalDeadlineMs?: number | null;
  headers?: Record<string, string>;
  /**
   * Sparse-fieldset trim for `artist()` / `dossier.artist()` (v2 `?fields=`): the top-level
   * dossier facets to KEEP. Omit for the full dossier (one round-trip). An unknown field
   * throws a teaching `CrateAPIError` (`invalid_fields`) carrying the valid set + an example.
   */
  fields?: string[];
}

/** Beacon body with the SDK-injected `timestamp` optional. */
export type ObservedBeaconInput = Omit<ObservedBeaconRequest, 'timestamp'> & { timestamp?: string };
export type RefinedBeaconInput = Omit<RefinedBeaconRequest, 'timestamp'> & { timestamp?: string };

/**
 * `crate.tastemakers` — a callable namespace. Not every listener is equal: some DJs and
 * curators consistently champion artists before they break. Call it for the full
 * leaderboard, or use `.onesToWatch()` for just the up-and-comers.
 */
export interface TastemakersApi {
  /**
   * The tastemaker leaderboard — early-moving curators/DJs ranked, with ones-to-watch
   * and early-spinner slices. Leading indicators, not vanity counts.
   * @example
   * ```ts
   * const t = await crate.tastemakers();
   * t.leaderboard.forEach((x) => console.log(x.rank, x.name, x.ownTier));
   * ```
   */
  (opts?: RequestOptions): Promise<TastemakersResponse>;
  /**
   * Just the 'ones to watch' slice — rising names with emergence and momentum tiers.
   * @example
   * ```ts
   * const w = await crate.tastemakers.onesToWatch();
   * ```
   */
  onesToWatch(opts?: RequestOptions): Promise<OnesToWatchResponse>;
}

/**
 * `crate.aura` — a callable namespace. An artist's "aura" is how many INDEPENDENT
 * signal dimensions (booking, radio, press, …) are converging on them inside an
 * 18-month window, with measured 12-month break odds. Call it for the index
 * (strongest first), or `.artist(clusterId)` for one artist's row.
 */
export interface AuraApi {
  /**
   * The aura index — artists whose signals are converging across several dimensions
   * at once, strongest first. `state: 'degraded'` = a substrate read failed (items
   * empty, still HTTP 200) — branch on it rather than assuming rows.
   * @example
   * ```ts
   * const a = await crate.aura({ limit: 100 });
   * a.items.forEach((x) => console.log(x.display, x.convergence_dim_count));
   * ```
   */
  (params?: { limit?: number }, opts?: RequestOptions): Promise<AuraIndexResponse>;
  /**
   * One artist's aura row by 64-hex `cluster_id`. `present: false` is a normal answer
   * (single-dimension artists are filtered by the universe rule; inactive artists age
   * out of the window) — branch on `present`, don't treat it as an error.
   * @example
   * ```ts
   * const a = await crate.aura.artist(clusterId);
   * if (a.present) console.log(a.break_odds);
   * ```
   */
  artist(clusterId: string, opts?: RequestOptions): Promise<AuraArtistResponse>;
}

/**
 * `crate.dossier.*` — the full, contract-versioned dossier grains. A dossier isn't
 * metadata; it's a profile assembled from many independent signal facets, each one
 * sourced in `provenance`, with honest-gap `state` per section. (`dossier.artist` /
 * `dossier.label` are slug aliases of the top-level {@link Crate.artist} / {@link Crate.label}.)
 */
export interface DossierApi {
  /**
   * The deepest grain crate offers: an artist profile from ~24 independent facets
   * (emergence, live demand, tastemaker support, journalism, discography, the Bandcamp
   * facets…), each section present-with-signals or honestly marked absent. crate's
   * flagship. Accepts `{ fields }` to trim the dossier (default = full).
   * @example
   * ```ts
   * const d = await crate.dossier.artist('four-tet');
   * // → d.emergence.signals?.emergenceTier, d.discography.signals?.entries, …
   * ```
   */
  artist(slug: string, opts?: RequestOptions): Promise<ArtistDossierContract>;
  /**
   * The label-grain dossier by slug (cluster-first). Also reachable as the top-level
   * {@link Crate.label}.
   * @example
   * ```ts
   * const d = await crate.dossier.label('warp-records');
   * ```
   */
  label(slug: string, opts?: RequestOptions): Promise<LabelDossierContract>;
  /**
   * The festival-grain dossier by slug (identity + lineup signals) — useful for tying
   * artists to the events that book them.
   * @example
   * ```ts
   * const d = await crate.dossier.festival('dekmantel');
   * ```
   */
  festival(slug: string, opts?: RequestOptions): Promise<FestivalDossierContract>;
  /**
   * A table of contents for the dossier system — which grains exist, which are
   * available, and the contract version you're coding against. In v2, `master` is
   * demoted (it surfaces honestly under `unavailable_grains`).
   * @example
   * ```ts
   * const m = await crate.dossier.manifest();
   * console.log(m.contract_version, m.grains, m.unavailable_grains);
   * ```
   */
  manifest(opts?: RequestOptions): Promise<DossierManifest>;
}

/**
 * `crate.searchEvents.*` — beacons that flow telemetry *back* to crate so relevance
 * improves from real usage. Each REQUIRES a per-search `beaconToken` (a short-lived JWT
 * issued with the search response, distinct from your API key; version-agnostic).
 */
export interface SearchEventsApi {
  /**
   * Report an observed search event (e.g. a cache hit). Returns nothing on success —
   * fire-and-acknowledge telemetry.
   * @example
   * ```ts
   * await crate.searchEvents.observed(
   *   { search_event_id: id, source: 'swr-cache-hit' },
   *   { beaconToken },
   * );
   * ```
   * @throws {CrateValidationError} `beacon_token_required` when `beaconToken` is missing.
   */
  observed(
    body: ObservedBeaconInput,
    opts: RequestOptions & { beaconToken: string },
  ): Promise<void>;
  /**
   * Report a refined search — which facets changed (from → to) — so crate learns how
   * people narrow results.
   * @example
   * ```ts
   * await crate.searchEvents.refined(
   *   { search_event_id: id, changed_facets: [{ name: 'genre', to: 'idm' }] },
   *   { beaconToken },
   * );
   * ```
   * @throws {CrateValidationError} `beacon_token_required` when `beaconToken` is missing.
   */
  refined(body: RefinedBeaconInput, opts: RequestOptions & { beaconToken: string }): Promise<void>;
}

interface BaseSpec {
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  idempotent: boolean;
  bearerToken?: string;
  /** Defaults to true (key-first). Only index() + beacons set false. */
  requiresKey?: boolean;
}

/**
 * The official typed client for the crate public API (`/api/v2`, cluster-first).
 *
 * crate is **key-first**: every data endpoint requires an `apiKey` (only
 * {@link Crate.index} is keyless). Calling a data method without a key throws
 * {@link CrateValidationError} (`api_key_required`) before any network call.
 *
 * @example
 * import { Crate } from '@hosaka-fm/crate';
 * const crate = new Crate({ apiKey: process.env.CRATE_API_KEY });
 * const artist = await crate.artist('Four Tet');
 */
export class Crate {
  readonly #config: HttpConfig;

  /** Tastemaker leaderboard + ones-to-watch. @see {@link TastemakersApi} */
  readonly tastemakers: TastemakersApi;
  /** Multi-dimension convergence signals (index + per-artist). @see {@link AuraApi} */
  readonly aura: AuraApi;
  /** Per-grain dossier contracts (artist / label / festival / manifest). @see {@link DossierApi} */
  readonly dossier: DossierApi;
  /** Beacon telemetry (per-search JWT required). @see {@link SearchEventsApi} */
  readonly searchEvents: SearchEventsApi;

  constructor(options: CrateOptions = {}) {
    const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    // baseUrl must be origin-only — new URL(API_PREFIX + path, base) silently drops a base path.
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new CrateValidationError(`crate: invalid baseUrl ${JSON.stringify(options.baseUrl)}`, {
        code: 'base_url_has_path',
        param: 'baseUrl',
        hint: 'baseUrl must be a valid absolute origin',
        next: `new Crate({ baseUrl: "${DEFAULT_BASE_URL}" })`,
      });
    }
    if (parsed.pathname !== '/' && parsed.pathname !== '') {
      throw new CrateValidationError(
        `crate: baseUrl must be origin-only, got a path (${parsed.pathname})`,
        {
          code: 'base_url_has_path',
          param: 'baseUrl',
          hint: 'pass only the origin; the SDK appends /api/v2 itself',
          next: `new Crate({ baseUrl: "${parsed.origin}" })`,
        },
      );
    }

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new CrateValidationError('crate: global fetch is unavailable', {
        code: 'node_fetch_missing',
        param: 'fetch',
        hint: 'Node 18+ provides a global fetch; on older runtimes pass one explicitly',
        next: 'new Crate({ fetch: myFetch })',
      });
    }

    this.#config = {
      baseUrl: parsed.origin,
      fetchImpl,
      timeoutMs: options.timeout ?? 30000,
      maxRetries: options.maxRetries ?? 2,
      baseBackoffMs: 500,
      backoffFactor: 2,
      maxBackoffMs: options.maxBackoffMs ?? 8000,
      maxRetryAfterMs: options.maxRetryAfterMs ?? 60000,
      totalDeadlineMs: options.totalDeadlineMs !== undefined ? options.totalDeadlineMs : 120000,
      defaultHeaders: options.headers ?? {},
      ...(options.apiKey !== undefined ? { apiKey: options.apiKey } : {}),
    };

    // Callable function-objects + namespaces (capture `this`).
    const tastemakers = ((opts?: RequestOptions) =>
      this.#req<TastemakersResponse>(
        { method: 'GET', path: '/tastemakers', idempotent: true },
        opts,
      )) as TastemakersApi;
    tastemakers.onesToWatch = (opts?) =>
      this.#req<OnesToWatchResponse>(
        { method: 'GET', path: '/tastemakers/ones-to-watch', idempotent: true },
        opts,
      );
    this.tastemakers = tastemakers;

    const aura = ((params?: { limit?: number }, opts?: RequestOptions) =>
      this.#req<AuraIndexResponse>(
        {
          method: 'GET',
          path: '/aura',
          idempotent: true,
          ...(params?.limit !== undefined ? { query: { limit: params.limit } } : {}),
        },
        opts,
      )) as AuraApi;
    aura.artist = (clusterId, opts?) =>
      this.#req<AuraArtistResponse>(
        { method: 'GET', path: `/aura/${encodeURIComponent(clusterId)}`, idempotent: true },
        opts,
      );
    this.aura = aura;

    this.dossier = {
      artist: (slug, opts?) =>
        this.#req<ArtistDossierContract>(
          {
            method: 'GET',
            path: `/dossier/artist/${encodeURIComponent(slug)}`,
            idempotent: true,
            query: fieldsQuery(opts),
          },
          opts,
        ),
      label: (slug, opts?) =>
        this.#req<LabelDossierContract>(
          { method: 'GET', path: `/dossier/label/${encodeURIComponent(slug)}`, idempotent: true },
          opts,
        ),
      festival: (slug, opts?) =>
        this.#req<FestivalDossierContract>(
          {
            method: 'GET',
            path: `/dossier/festival/${encodeURIComponent(slug)}`,
            idempotent: true,
          },
          opts,
        ),
      manifest: (opts?) =>
        this.#req<DossierManifest>(
          { method: 'GET', path: '/dossier/manifest', idempotent: true },
          opts,
        ),
    };

    this.searchEvents = {
      observed: async (body, opts) => {
        requireBeaconToken('observed', opts);
        const filled = { ...body, timestamp: body.timestamp ?? new Date().toISOString() };
        return this.#req<void>(
          {
            method: 'POST',
            path: '/search-events/observed',
            body: filled,
            idempotent: false,
            bearerToken: opts.beaconToken,
            requiresKey: false, // beacon-token gated, not X-API-Key
          },
          opts,
        );
      },
      refined: async (body, opts) => {
        requireBeaconToken('refined', opts);
        const filled = { ...body, timestamp: body.timestamp ?? new Date().toISOString() };
        return this.#req<void>(
          {
            method: 'POST',
            path: '/search-events/refined',
            body: filled,
            idempotent: false,
            bearerToken: opts.beaconToken,
            requiresKey: false, // beacon-token gated, not X-API-Key
          },
          opts,
        );
      },
    };
  }

  #req<T>(spec: BaseSpec, opts?: RequestOptions): Promise<T> {
    // Key-first: crate's data API requires X-API-Key by default (post-cycle-078 wall).
    // Only endpoints that opt out (requiresKey:false — index + beacons) are keyless.
    if (spec.requiresKey !== false && !this.#config.apiKey) {
      return Promise.reject(
        new CrateValidationError(
          `crate: ${spec.method} ${spec.path || '/api/v2'} requires an API key`,
          {
            code: 'api_key_required',
            param: 'apiKey',
            hint: 'crate is key-first — construct the client with an apiKey (only crate.index() is keyless)',
            next: 'new Crate({ apiKey: process.env.CRATE_API_KEY })',
          },
        ),
      );
    }
    const merged: RequestSpec = {
      method: spec.method,
      path: spec.path,
      idempotent: spec.idempotent,
      ...(spec.query !== undefined ? { query: spec.query } : {}),
      ...(spec.body !== undefined ? { body: spec.body } : {}),
      ...(spec.bearerToken !== undefined ? { bearerToken: spec.bearerToken } : {}),
      ...(opts?.signal !== undefined ? { signal: opts.signal } : {}),
      ...(opts?.timeout !== undefined ? { timeoutMs: opts.timeout } : {}),
      ...(opts?.maxRetries !== undefined ? { maxRetries: opts.maxRetries } : {}),
      ...(opts?.maxBackoffMs !== undefined ? { maxBackoffMs: opts.maxBackoffMs } : {}),
      ...(opts?.maxRetryAfterMs !== undefined ? { maxRetryAfterMs: opts.maxRetryAfterMs } : {}),
      ...(opts?.totalDeadlineMs !== undefined ? { totalDeadlineMs: opts.totalDeadlineMs } : {}),
      ...(opts?.headers !== undefined ? { headers: opts.headers } : {}),
    };
    return request<T>(this.#config, merged);
  }

  /**
   * Resolve any identifier to a canonical {@link IdentityResolution}. Identity is the
   * hard problem in music data — the same artist is a Bandcamp subdomain, a Discogs id,
   * an MBID and five spellings. This collapses any of them to crate's single canonical
   * `cluster_id`, plus every other place that artist lives online. It's the first call
   * in most workflows, because almost everything else is keyed on `cluster_id`. Accepts
   * a bare string (inferred: URL → `url`, `discogs:`/`mbid:` → locator, 64-hex →
   * `cluster`, else → `q`) or an explicit one-of object. A 200 with `cluster_id: null`
   * is an honest gap, not an error.
   * @example
   * ```ts
   * const id = await crate.resolve('https://fourtet.bandcamp.com');
   * // → { cluster_id: '9f2c…', display: 'Four Tet', resolved_from: 'url',
   * //     locators: { discogs: 1234, bandcamp: ['fourtet'], … } }
   * await crate.resolve({ discogs: 1234 }); // or an explicit one-of
   * ```
   * @throws {CrateValidationError} `exactly_one_of` if zero/multiple identifiers are given.
   * @throws {CrateAPIError} on a non-2xx response. @see {@link Crate.artist}
   */
  async resolve(query: string | ResolveQuery, opts?: RequestOptions): Promise<IdentityResolution> {
    const q = typeof query === 'string' ? classifyResolveString(query) : query;
    const { key, value } = resolveQueryToParam(q);
    return this.#req<IdentityResolution>(
      { method: 'GET', path: '/resolve', query: { [key]: value }, idempotent: true },
      opts,
    );
  }

  /**
   * Fetch an artist dossier in one call — the shortcut when you already mean a specific
   * artist. Hand it almost anything (a name, slug, 64-hex `cluster_id`, or
   * `discogs:`/`mbid:` locator): a direct key hits `/artist/{key}`, while a locator or
   * bare numeric id is resolved first. The dossier is full by default; pass `{ fields }`
   * to trim it. An unresolved locator throws {@link CrateNotFoundError} — use
   * {@link Crate.artistOrNull} to receive `null`.
   *
   * In v2 (cluster-first), release/master detail attaches here as the `discography`
   * dimension and Bandcamp standing as `bandcamp_emergence` / `bandcamp_tastemaker` —
   * there are no standalone `master`/`bandcamp` methods.
   * @example
   * ```ts
   * const a = await crate.artist('Four Tet');                 // name → dossier
   * await crate.artist('discogs:1234');                       // locator → resolve → dossier
   * await crate.artist('Four Tet', { fields: ['discography'] }); // trim to one facet
   * ```
   * @throws {CrateNotFoundError} `not_found` when a locator/numeric id resolves to no cluster.
   * @throws {CrateAPIError} on a non-2xx response (e.g. `invalid_fields`). @see {@link Crate.resolve}
   */
  async artist(key: string, opts?: RequestOptions): Promise<ArtistDossierContract> {
    return (await this.#artistDossier(key, 'throw', opts)) as ArtistDossierContract;
  }

  /**
   * Fetch one Bandcamp release addressed *under its artist* — the full tracklist (with
   * per-track `duration_s`), fetchable artwork URLs, label, tags, and economics. The
   * cluster-attached per-release grain: list `item` ids from an artist dossier's
   * `bandcamp_releases` facet, then hand `(key, item)` here for the detail.
   *
   * Cluster-first integrity: if the release is unknown OR filed under a *different*
   * artist, the response is the honest gap `{ present: false, note }` — never another
   * artist's data, never a 404. Branch on `present`.
   * @example
   * ```ts
   * const r = await crate.artistBandcampRelease(clusterId, '2783508421');
   * if (r.present) console.log(r.release.title, r.release.tracks.length);
   * ```
   * @throws {CrateAPIError} on a non-2xx response. @see {@link Crate.artist}
   */
  artistBandcampRelease(
    key: string,
    item: string,
    opts?: RequestOptions,
  ): Promise<ArtistBandcampReleaseResponse> {
    return this.#req<ArtistBandcampReleaseResponse>(
      {
        method: 'GET',
        path: `/artist/${encodeURIComponent(key)}/bandcamp/${encodeURIComponent(item)}`,
        idempotent: true,
      },
      opts,
    );
  }

  /**
   * Fetch one master (release-group) dossier addressed *under its artist* — the full
   * rich contract (header, every signal section, artwork, provenance). The cluster-
   * attached per-master grain: list `id`s from an artist dossier's `discography` facet,
   * then hand `(key, id)` here for the detail.
   *
   * Cluster-first integrity: if the master is unknown, credited to a *different* artist,
   * or bound only via a homonym name over-merge, the response is the honest gap
   * `{ present: false, note }` — never another artist's dossier, never a 404. Branch on
   * `present`; when present, `binding.observed` flags an over-merged (unverified) binding.
   * @example
   * ```ts
   * const r = await crate.artistMaster(clusterId, '11772');
   * if (r.present) console.log(r.master.header.title, r.binding.observed);
   * ```
   * @throws {CrateAPIError} on a non-2xx response. @see {@link Crate.artist}
   */
  artistMaster(key: string, id: string, opts?: RequestOptions): Promise<ArtistMasterResponse> {
    return this.#req<ArtistMasterResponse>(
      {
        method: 'GET',
        path: `/artist/${encodeURIComponent(key)}/master/${encodeURIComponent(id)}`,
        idempotent: true,
      },
      opts,
    );
  }

  /**
   * Like {@link Crate.artist}, but returns `null` for the honest-gap case (a locator or
   * numeric id that resolves to no cluster) instead of throwing. crate is honest about
   * absence — reach for this in pipelines and agent loops where 'not found' is a normal
   * branch, not an exception to catch.
   * @example
   * ```ts
   * const a = await crate.artistOrNull('discogs:999999'); // → null if unresolved
   * if (a) console.log(a.display);
   * ```
   * @throws {CrateAPIError} on a non-2xx response. @see {@link Crate.artist}
   */
  artistOrNull(key: string, opts?: RequestOptions): Promise<ArtistDossierContract | null> {
    return this.#artistDossier(key, 'null', opts);
  }

  async #artistDossier(
    key: string,
    onGap: 'throw' | 'null',
    opts?: RequestOptions,
  ): Promise<ArtistDossierContract | null> {
    const cls = classifyArtistKey(key);
    if (cls.type === 'direct') {
      return this.#req<ArtistDossierContract>(
        {
          method: 'GET',
          path: `/artist/${encodeURIComponent(cls.key)}`,
          idempotent: true,
          query: fieldsQuery(opts),
        },
        opts,
      );
    }
    const id = await this.resolve(
      cls.scheme === 'discogs' ? { discogs: cls.rest } : { mbid: cls.rest },
      opts,
    );
    if (id.cluster_id == null) {
      if (onGap === 'null') return null;
      throw new CrateNotFoundError(
        `crate.artist(): no cluster_id resolved for ${cls.scheme}:${cls.rest}`,
        {
          hint: id.note ?? `the ${cls.scheme} locator did not resolve to a known artist`,
          next: 'use crate.artistOrNull() to receive null instead of a throw',
        },
      );
    }
    return this.#req<ArtistDossierContract>(
      {
        method: 'GET',
        path: `/artist/${encodeURIComponent(id.cluster_id)}`,
        idempotent: true,
        query: fieldsQuery(opts),
      },
      opts,
    );
  }

  /**
   * Fetch a label dossier in one call (cluster-first) by `cluster_id` or slug — the
   * label peer of {@link Crate.artist}, promoted to a first-class resource in v2.
   * @example
   * ```ts
   * const l = await crate.label('warp-records');
   * ```
   * @throws {CrateValidationError} `empty_key` on an empty/whitespace key.
   * @throws {CrateAPIError} on a non-2xx response.
   */
  async label(key: string, opts?: RequestOptions): Promise<LabelDossierContract> {
    assertNonEmptyKey(key, 'label');
    return this.#req<LabelDossierContract>(
      { method: 'GET', path: `/label/${encodeURIComponent(key.trim())}`, idempotent: true },
      opts,
    );
  }

  /**
   * Faceted discovery across the whole catalogue. Filter by genre, style, format,
   * country, label and year range — each multi-value facet combines with AND or OR via
   * its `*_mode` sibling. The response also tells you whether the total count is exact
   * or estimated from a sample.
   * @example
   * ```ts
   * const hits = await crate.search({ genre: ['idm', 'ambient'], genre_mode: 'or', year_from: 2000, limit: 20 });
   * // → hits.results: ResultRow[]; hits.pagination.total_results / total_results_mode
   * ```
   * @throws {CrateAPIError} on a non-2xx response.
   */
  search(params?: SearchParams, opts?: RequestOptions): Promise<SearchResponse> {
    return this.#req<SearchResponse>(
      { method: 'GET', path: '/search', query: searchQuery(params), idempotent: true },
      opts,
    );
  }

  /**
   * Browse the artist grain — the discovery grid. Filter by `genre` + `style` (exact,
   * case-sensitive — see {@link Crate.facets} for the live vocabulary; an unknown value
   * returns an empty `items` with a `note`, never throws) and `tier`
   * (breakout|rising|steady). Sorted by `discovery` (rising artists first) unless you
   * pass `sort: 'reach'`. Each row carries `cluster_id` — feed a non-null one to
   * {@link Crate.artist}. Offset pagination is capped at `offset + limit ≤ 500` (narrow
   * with filters, don't page deep); a `_links.next` appears while more fits in-window.
   * @example
   * ```ts
   * const grid = await crate.artists({ genre: 'Electronic', tier: 'rising' });
   * grid.items.forEach((a) => console.log(a.display, a.emergence_tier, a.cluster_id));
   * ```
   * @throws {CrateAPIError} on a non-2xx response. @see {@link Crate.facets}
   */
  artists(params?: ArtistBrowseParams, opts?: RequestOptions): Promise<ArtistBrowseResponse> {
    const query: Record<string, string | number> = {};
    if (params?.genre !== undefined) query.genre = params.genre;
    if (params?.style !== undefined) query.style = params.style;
    if (params?.tier !== undefined) query.tier = params.tier;
    if (params?.sort !== undefined) query.sort = params.sort;
    if (params?.limit !== undefined) query.limit = params.limit;
    if (params?.offset !== undefined) query.offset = params.offset;
    return this.#req<ArtistBrowseResponse>(
      { method: 'GET', path: '/artists', query, idempotent: true },
      opts,
    );
  }

  /**
   * The emerging-artists breakouts index — artists breaking out now, backed by
   * corroborating evidence (press, bookings) rather than a single noisy signal. Each
   * item carries an emergence tier, a score, and how it was corroborated.
   * @example
   * ```ts
   * const b = await crate.breakouts();
   * b.items.forEach((i) => console.log(i.name, i.emergenceTier, i.corroboration));
   * ```
   * @throws {CrateAPIError} on a non-2xx response.
   */
  breakouts(opts?: RequestOptions): Promise<BreakoutsResponse> {
    return this.#req<BreakoutsResponse>(
      { method: 'GET', path: '/breakouts', idempotent: true },
      opts,
    );
  }

  /**
   * The self-describing API root — a machine-readable map of every resource plus a
   * 'cold start' recipe, task recipes, and a runtime error catalogue (v2). The one
   * **keyless** endpoint, so a new integration or an agent can discover what's possible
   * before committing to anything.
   * @example
   * ```ts
   * const root = await crate.index(); // works without an apiKey
   * console.log(root.cold_start.problem);
   * root.resources.forEach((r) => console.log(r.name, r.auth));
   * ```
   * @throws {CrateAPIError} on a non-2xx response.
   */
  index(opts?: RequestOptions): Promise<ApiRootIndex> {
    return this.#req<ApiRootIndex>(
      { method: 'GET', path: '', idempotent: true, requiresKey: false },
      opts,
    );
  }

  /**
   * A precomputed facet snapshot — the available filter values and their counts. Call
   * it before building a search UI (or an agent query) so you filter by values that
   * actually return results. **Key-gated.**
   * @example
   * ```ts
   * const facets = await crate.facets(); // requires apiKey
   * ```
   * @throws {CrateValidationError} `api_key_required` if constructed without an apiKey.
   * @throws {CrateAPIError} on a non-2xx response (401/402 if the key lacks access).
   */
  facets(opts?: RequestOptions): Promise<FacetCounts> {
    return this.#req<FacetCounts>({ method: 'GET', path: '/facets', idempotent: true }, opts);
  }

  /**
   * The generic surface registry — every queryable cluster-keyed producer surface crate
   * exposes (cycle-096 / carrefour#135's confirmed-cost corollary: **one generic
   * accessor**, not a method per surface), with its shape: grain, key (column + keyspace
   * + wire format), keyset (pagination seek columns; `null` for cluster-row grain), cap,
   * liveness, and a coverage note. Read a row here before calling {@link Crate.surface}
   * on its `name` — it's the complete input contract for that call.
   * @example
   * ```ts
   * const reg = await crate.surfaces();
   * reg.surfaces.forEach((s) => console.log(s.name, s.key.keyspace, s.grain));
   * ```
   * @throws {CrateAPIError} on a non-2xx response. @see {@link Crate.surface}
   */
  surfaces(opts?: RequestOptions): Promise<SurfaceIndexResponse> {
    return this.#req<SurfaceIndexResponse>(
      { method: 'GET', path: '/surface', idempotent: true },
      opts,
    );
  }

  /**
   * The generic cluster-keyed surface read — one operation serves every row registered
   * in {@link Crate.surfaces}. `name` is the schema-qualified registry key (pass it
   * verbatim from a `surfaces()` row's `name`); `cluster` is the 64-hex identity key in
   * THAT surface's registered keyspace — most surfaces are artist-grain, but
   * `seen.song_station_journey` is keyed on a **recording**-grain cluster, not the
   * artist (check the row's `key.keyspace` before calling). A key from the wrong
   * keyspace fails soft as an empty `honest_gap`, never an error.
   *
   * `state` is one of `present` (rows), `honest_gap` (0 rows — a normal answer, not an
   * error), or `degraded` (still HTTP 200, `rows: []` — the dedicated surface-reader
   * pool/role hasn't landed on the replica yet; branch on it, don't retry expecting
   * rows). cluster-row grain surfaces (cap 1/1) ignore `after`/`limit` and answer with
   * 0-1 rows; cluster-multirow/cluster-edge-list grains keyset-paginate via the opaque
   * `after` cursor from a prior page's `next_after` — pass it back **verbatim**, never
   * construct or decode it.
   *
   * Cursor durability: cursors are **page-iteration handles, not durable bookmarks** —
   * some surfaces build them from producer-internal columns that can change across
   * producer re-crawls, so a stored cursor may silently skip or repeat rows later.
   * Restart from the first page (omit `after`) for a fresh read rather than resuming a
   * cursor saved from a previous session.
   * @example
   * ```ts
   * const page = await crate.surface('seen.radio_play_v1', { cluster: clusterId, limit: 50 });
   * if (page.state === 'present') page.rows.forEach((r) => console.log(r.station_key));
   * const next = page.next_after
   *   ? await crate.surface('seen.radio_play_v1', { cluster: clusterId, after: page.next_after })
   *   : null;
   * ```
   * @throws {CrateAPIError} `invalid_name` (400) for an unregistered/unknown `name` — the
   * error carries every valid name + `doc_url` + `next` (call {@link Crate.surfaces}).
   */
  surface(
    name: SurfaceName,
    params: SurfaceParams,
    opts?: RequestOptions,
  ): Promise<SurfaceRowsResponse> {
    const query: Record<string, QueryValue> = { cluster: params.cluster };
    if (params.after !== undefined) query.after = params.after;
    if (params.limit !== undefined) query.limit = params.limit;
    return this.#req<SurfaceRowsResponse>(
      { method: 'GET', path: `/surface/${encodeURIComponent(name)}`, query, idempotent: true },
      opts,
    );
  }
}

// --- module-local query builders (pure) ---

function searchQuery(params?: SearchParams): Record<string, QueryValue> {
  const q: Record<string, QueryValue> = {};
  if (!params) return q;
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) q[k] = v as QueryValue;
  }
  return q;
}

/** The v2 `?fields=` opt-out trim: a non-empty `fields` array → `fields=a,b`; else no param (full dossier). */
function fieldsQuery(opts?: RequestOptions): Record<string, QueryValue> | undefined {
  return opts?.fields && opts.fields.length > 0 ? { fields: opts.fields.join(',') } : undefined;
}

function requireBeaconToken(method: string, opts: { beaconToken?: string }): void {
  if (!opts || !opts.beaconToken) {
    throw new CrateValidationError(`crate.searchEvents.${method}() requires a beaconToken`, {
      code: 'beacon_token_required',
      param: 'beaconToken',
      hint: 'pass the per-search beacon JWT issued with the search response',
      next: `crate.searchEvents.${method}(body, { beaconToken })`,
    });
  }
}
