// The Crate client (SDD §3). A thin, typed surface over the shared transport:
// every method builds a small request spec and delegates to http.ts. Conveniences
// (resolve/artist/bandcamp) add the SDK's earned logic; everything else is a 1:1
// typed wrapper. Designed for AI-agent ergonomics (ADX-1..10): forgiving inputs,
// teaching errors, JSON-safe failures, a self-description surface.
import { CrateNotFoundError, CrateValidationError } from './errors';
import { type HttpConfig, type QueryValue, request, type RequestSpec } from './http';
import {
  assertNonEmptyKey,
  classifyArtistKey,
  classifyResolveString,
  type ResolveQuery,
  resolveQueryToParam,
} from './identity';
import { type BandcampBulkParams, type BulkIterable, makeBulkIterable } from './pagination';
import type {
  ApiRootIndex,
  ArtistDossierContract,
  BandcampBulkPage,
  BandcampFeedContract,
  BandcampRelease,
  BandcampReleaseResponse,
  BandcampReleaseSummary,
  BatchResponse,
  BreakoutsResponse,
  DossierManifest,
  FacetCounts,
  FestivalDossierContract,
  IdentityResolution,
  LabelDossierContract,
  MasterDossierContract,
  MasterEnrichment,
  ObservedBeaconRequest,
  OnesToWatchResponse,
  RefinedBeaconRequest,
  SearchParams,
  SearchResponse,
  TastemakersResponse,
  UsageResponse,
  WayfindAnswerResponse,
  WayfindInterpretResponse,
} from './types';

const DEFAULT_BASE_URL = 'https://crate.0xhoneyjar.xyz';

export interface CrateOptions {
  /** Customer API key → `X-API-Key`. Required for every data endpoint (crate is key-first); only `crate.index()` is keyless. */
  apiKey?: string;
  /** API origin (no path). Default `https://crate.0xhoneyjar.xyz`. */
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

/** Per-call overrides of the retry/timeout knobs, plus an `AbortSignal`. */
export interface RequestOptions {
  signal?: AbortSignal;
  timeout?: number;
  maxRetries?: number;
  maxBackoffMs?: number;
  maxRetryAfterMs?: number;
  totalDeadlineMs?: number | null;
  headers?: Record<string, string>;
}

/** Beacon body with the SDK-injected `timestamp` optional. */
export type ObservedBeaconInput = Omit<ObservedBeaconRequest, 'timestamp'> & { timestamp?: string };
export type RefinedBeaconInput = Omit<RefinedBeaconRequest, 'timestamp'> & { timestamp?: string };

/**
 * `crate.bandcamp` — a callable namespace. Bandcamp carries underground signal the
 * major databases miss. Call it with an artist key for that artist's Bandcamp feed,
 * or use the helpers to sweep crate's platform-wide feed of release signals.
 */
export interface BandcampApi {
  /**
   * The per-artist Bandcamp feed — the bridge from an identity to its Bandcamp
   * footprint. `artistKey` is a cluster_id, `discogs:<id>`, or `mbid:<uuid>`.
   * @example
   * ```ts
   * const feed = await crate.bandcamp('discogs:1234');
   * ```
   */
  (artistKey: string, opts?: RequestOptions): Promise<BandcampFeedContract>;
  /**
   * One keyset page of crate's platform-wide Bandcamp signal feed (the whole feed,
   * not one artist). Each page returns an opaque `next_cursor` you persist to resume —
   * use this when you manage paging yourself across runs or processes.
   * @example
   * ```ts
   * const page = await crate.bandcamp.bulk({ source: 'signals_mbid' });
   * // → page.rows: Record<string, unknown>[]; page.next_cursor: 'eyJ…' | null
   * ```
   */
  bulk(params?: BandcampBulkParams, opts?: RequestOptions): Promise<BandcampBulkPage>;
  /**
   * The same feed, paged for you: an async iterable that follows cursors automatically
   * until the feed ends. Yields rows by default; call `.pages()` for whole pages (with
   * `_meta`), and cap the sweep with `maxPages`.
   * @example
   * ```ts
   * for await (const row of crate.bandcamp.bulkAll({ source: 'signals_mbid', maxPages: 5 })) {
   *   ingest(row);
   * }
   * ```
   */
  bulkAll(params?: BandcampBulkParams, opts?: RequestOptions): BulkIterable;
  /**
   * The no-arg Bandcamp index — discover the valid `source` names for `bulk()` /
   * `bulkAll()` rather than guessing the string.
   * @example
   * ```ts
   * const idx = await crate.bandcamp.index();
   * ```
   */
  index(opts?: RequestOptions): Promise<BandcampBulkPage>;
  /**
   * Zoom into one Bandcamp album and get its dossier, including the full tracklist, by
   * opaque item id or album URL. Returns `null` on the honest gap (HTTP 200
   * `present: false`) — not an error. `track.track_url` is the track PAGE, never a
   * playable stream (those are tokenised/ToS-bound); artwork is link-only.
   * @example
   * ```ts
   * const r = await crate.bandcamp.release({ item: '1234567890' });
   * if (r) for (const t of r.tracks) console.log(t.track_num, t.title, t.duration_s);
   * // r === null → honest gap, not an error
   * ```
   */
  release(
    query: { item: string } | { url: string },
    opts?: RequestOptions,
  ): Promise<BandcampRelease | null>;
  /**
   * All of an artist's Bandcamp releases for a `cluster_id` (usually from `resolve()`)
   * as lightweight summary rows — no tracklists. List a discography fast, then
   * `release()` into the one you want.
   * @example
   * ```ts
   * const releases = await crate.bandcamp.releases({ clusterId });
   * ```
   */
  releases(query: { clusterId: string }, opts?: RequestOptions): Promise<BandcampReleaseSummary[]>;
}

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
 * `crate.wayfind` — a callable namespace for natural-language access to the catalogue.
 * Call it to get an answer; use `.interpret()` to get structured search params back.
 */
export interface WayfindApi {
  /**
   * Ask the catalogue a question in plain English and get an answer — the NL front
   * door, handy when wiring crate into a chat or an agent.
   * @example
   * ```ts
   * const a = await crate.wayfind('breakout dub techno artists from 2023');
   * ```
   */
  (question: string, opts?: RequestOptions): Promise<WayfindAnswerResponse>;
  /**
   * The 'show your work' twin of `wayfind()`: returns the structured search params it
   * understood from your text, ready to hand to {@link Crate.search}. **Key-gated.**
   * @example
   * ```ts
   * const params = await crate.wayfind.interpret('ambient from japan, 90s');
   * ```
   * @throws {CrateValidationError} `api_key_required` without an apiKey.
   */
  interpret(q: string, opts?: RequestOptions): Promise<WayfindInterpretResponse>;
}

/**
 * `crate.dossier.*` — the full, contract-versioned dossier grains. A dossier isn't
 * metadata; it's a profile assembled from many independent signal facets, each one
 * sourced in `provenance`, with honest-gap `state` per section.
 */
export interface DossierApi {
  /**
   * The full master (record) dossier — richer than {@link Crate.master}'s flat
   * enrichment: a structured header, per-field sections, artwork, freshness, provenance.
   * @example
   * ```ts
   * const d = await crate.dossier.master(1234567);
   * ```
   */
  master(id: number, opts?: RequestOptions): Promise<MasterDossierContract>;
  /**
   * The deepest grain crate offers: an artist profile from ~24 independent facets
   * (emergence, live demand, tastemaker support, journalism, network position…), each
   * section present-with-signals or honestly marked absent. crate's flagship.
   * @example
   * ```ts
   * const d = await crate.dossier.artist('four-tet');
   * // → d.emergence.signals?.emergenceTier, d.live_demand.signals?.demandTier, …
   * ```
   */
  artist(slug: string, opts?: RequestOptions): Promise<ArtistDossierContract>;
  /**
   * The label-grain dossier by slug.
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
   * available, and the contract version you're coding against.
   * @example
   * ```ts
   * const m = await crate.dossier.manifest();
   * console.log(m.contract_version, m.grains);
   * ```
   */
  manifest(opts?: RequestOptions): Promise<DossierManifest>;
}

/**
 * `crate.searchEvents.*` — beacons that flow telemetry *back* to crate so relevance
 * improves from real usage. Each REQUIRES a per-search `beaconToken` (a short-lived JWT
 * issued with the search response, distinct from your API key).
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
 * The official typed client for the crate public API.
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

  /** Per-artist Bandcamp feed + bulk pagination. @see {@link BandcampApi} */
  readonly bandcamp: BandcampApi;
  /** Tastemaker leaderboard + ones-to-watch. @see {@link TastemakersApi} */
  readonly tastemakers: TastemakersApi;
  /** Natural-language answer + (key-gated) interpret. @see {@link WayfindApi} */
  readonly wayfind: WayfindApi;
  /** Per-grain dossier contracts. @see {@link DossierApi} */
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
          hint: 'pass only the origin; the SDK appends /api/v1 itself',
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
    const bandcamp = (async (artistKey: string, opts?: RequestOptions) => {
      assertNonEmptyKey(artistKey, 'bandcamp');
      return this.#req<BandcampFeedContract>(
        { method: 'GET', path: `/bandcamp/${encodeURIComponent(artistKey)}`, idempotent: true },
        opts,
      );
    }) as BandcampApi;
    bandcamp.bulk = (params?, opts?) =>
      this.#req<BandcampBulkPage>(
        { method: 'GET', path: '/bandcamp', query: bulkQuery(params), idempotent: true },
        opts,
      );
    bandcamp.index = (opts?) =>
      this.#req<BandcampBulkPage>({ method: 'GET', path: '/bandcamp', idempotent: true }, opts);
    bandcamp.bulkAll = (params: BandcampBulkParams = {}, opts?) =>
      makeBulkIterable(
        (p) =>
          this.#req<BandcampBulkPage>(
            { method: 'GET', path: '/bandcamp', query: bulkQuery(p), idempotent: true },
            opts,
          ),
        params,
      );
    bandcamp.release = async (query, opts?) => {
      const q: Record<string, QueryValue> = {};
      if ('item' in query && query.item) q.item = query.item;
      else if ('url' in query && query.url) q.url = query.url;
      if (q.item === undefined && q.url === undefined) {
        throw new CrateValidationError('crate.bandcamp.release() needs exactly one of item | url', {
          code: 'exactly_one_of',
          param: 'query',
          hint: 'pass { item } (bandcamp_item_id) or { url } (album page URL)',
          next: 'crate.bandcamp.release({ item: "1234567890" })',
        });
      }
      const res = await this.#req<BandcampReleaseResponse>(
        { method: 'GET', path: '/bandcamp/release', query: q, idempotent: true },
        opts,
      );
      // Honest gap: present:false → null (not an error). A release_list is unexpected for item/url.
      return res.object === 'bandcamp.release' && res.present ? res.release : null;
    };
    bandcamp.releases = async (query, opts?) => {
      if (!query?.clusterId) {
        throw new CrateValidationError('crate.bandcamp.releases() needs a clusterId', {
          code: 'exactly_one_of',
          param: 'clusterId',
          hint: 'pass { clusterId } (64-hex cluster_id)',
          next: 'crate.bandcamp.releases({ clusterId: "<64-hex>" })',
        });
      }
      const res = await this.#req<BandcampReleaseResponse>(
        {
          method: 'GET',
          path: '/bandcamp/release',
          query: { cluster_id: query.clusterId },
          idempotent: true,
        },
        opts,
      );
      return res.object === 'bandcamp.release_list' ? res.releases : [];
    };
    this.bandcamp = bandcamp;

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

    const wayfind = ((question: string, opts?: RequestOptions) =>
      this.#req<WayfindAnswerResponse>(
        { method: 'POST', path: '/wayfind/answer', body: { question }, idempotent: true },
        opts,
      )) as WayfindApi;
    wayfind.interpret = (q: string, opts?) =>
      this.#req<WayfindInterpretResponse>(
        { method: 'POST', path: '/wayfind/interpret', body: { q }, idempotent: true },
        opts,
      );
    this.wayfind = wayfind;

    this.dossier = {
      master: (id, opts?) =>
        this.#req<MasterDossierContract>(
          {
            method: 'GET',
            path: `/dossier/master/${encodeURIComponent(String(id))}`,
            idempotent: true,
          },
          opts,
        ),
      artist: (slug, opts?) =>
        this.#req<ArtistDossierContract>(
          { method: 'GET', path: `/dossier/artist/${encodeURIComponent(slug)}`, idempotent: true },
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
          `crate: ${spec.method} ${spec.path || '/api/v1'} requires an API key`,
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
   * bare numeric id is resolved first. An unresolved locator throws
   * {@link CrateNotFoundError} — use {@link Crate.artistOrNull} to receive `null`.
   * @example
   * ```ts
   * const a = await crate.artist('Four Tet');     // name → dossier
   * await crate.artist('discogs:1234');           // locator → resolve → dossier
   * // → a.display, a.resolved_via, a.emergence.signals, a.across_the_web, …
   * ```
   * @throws {CrateNotFoundError} `not_found` when a locator/numeric id resolves to no cluster.
   * @throws {CrateAPIError} on a non-2xx response. @see {@link Crate.resolve}, {@link Crate.artistOrNull}
   */
  async artist(key: string, opts?: RequestOptions): Promise<ArtistDossierContract> {
    return (await this.#artistDossier(key, 'throw', opts)) as ArtistDossierContract;
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
        { method: 'GET', path: `/artist/${encodeURIComponent(cls.key)}`, idempotent: true },
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
      { method: 'GET', path: `/artist/${encodeURIComponent(id.cluster_id)}`, idempotent: true },
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
   * 'cold start' recipe. The one **keyless** endpoint, so a new integration or an agent
   * can discover what's possible before committing to anything.
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
   * Enrich one 'master' (a record/album in the Discogs sense) with crate's behavioral
   * signals: collector ownership, DJ play counts, critic attention, formats, and its
   * slot in the cube taxonomy — the per-record intelligence layer over plain
   * discography. **Key-gated.** `id` is a positive integer (server-validated).
   * @example
   * ```ts
   * const m = await crate.master(1234567); // requires apiKey
   * // → m.owner_count, m.dj_count, m.cube_quadrant, …
   * ```
   * @throws {CrateValidationError} `api_key_required` if constructed without an apiKey.
   * @throws {CrateAPIError} on a non-2xx response.
   */
  master(id: number, opts?: RequestOptions): Promise<MasterEnrichment> {
    return this.#req<MasterEnrichment>(
      { method: 'GET', path: `/masters/${encodeURIComponent(String(id))}`, idempotent: true },
      opts,
    );
  }

  /**
   * Batch master enrichment — up to 100 records in one round-trip. Returns the rows it
   * found plus an explicit `not_found` list, so a partial result is first-class rather
   * than all-or-nothing. Use it to hydrate a page of search results in one call instead
   * of N. **Key-gated.**
   * @example
   * ```ts
   * const batch = await crate.masters([12345, 67890]); // requires apiKey
   * // → batch.results: MasterEnrichment[]; batch.not_found: number[]
   * ```
   * @throws {CrateValidationError} `api_key_required` (no key) or `masters_arity` (not 1..100 ids).
   * @throws {CrateAPIError} on a non-2xx response.
   */
  async masters(ids: number[], opts?: RequestOptions): Promise<BatchResponse> {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100) {
      throw new CrateValidationError(
        `crate.masters() needs 1..100 ids, got ${Array.isArray(ids) ? ids.length : 'a non-array'}`,
        {
          code: 'masters_arity',
          param: 'ids',
          hint: 'pass between 1 and 100 master ids (chunk larger sets)',
          next: 'crate.masters([12345, 67890])',
        },
      );
    }
    return this.#req<BatchResponse>(
      { method: 'POST', path: '/masters/batch', body: { ids }, idempotent: true },
      opts,
    );
  }

  /**
   * Your meter — plan tier, calls made this month, quota and remaining, and the
   * per-minute burst limit. Poll it to render a usage bar or back off before a wall.
   * **Key-gated.**
   * @example
   * ```ts
   * const u = await crate.usage(); // requires apiKey
   * console.log(`${u.calls_this_month}/${u.quota_monthly} on ${u.tier}`);
   * ```
   * @throws {CrateValidationError} `api_key_required` if constructed without an apiKey.
   * @throws {CrateAPIError} on a non-2xx response.
   */
  usage(opts?: RequestOptions): Promise<UsageResponse> {
    return this.#req<UsageResponse>({ method: 'GET', path: '/usage', idempotent: true }, opts);
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

function bulkQuery(params?: {
  source?: string;
  cursor?: string | null;
  limit?: number;
}): Record<string, QueryValue> {
  const q: Record<string, QueryValue> = {};
  if (!params) return q;
  if (params.source) q.source = params.source;
  if (params.cursor != null) q.cursor = params.cursor;
  if (params.limit != null) q.limit = Math.max(1, Math.min(200, Math.trunc(params.limit)));
  return q;
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
