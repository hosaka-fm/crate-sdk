// Public, contract-faithful type re-exports off the generated OpenAPI module (crate /api/v2,
// 2.0.0). Every public method's request AND return type is nameable from the package (SDD §2).
// The spec carries operationIds (since 1.4.0), but we alias `components['schemas']` directly by
// choice — the schema names are the stable, consumer-facing contract; query-param input types
// are hand-authored in their owning modules (SDD §3.5). Cluster-first: master/bandcamp/wayfind/
// usage are demoted in v2; release/master detail lives on `ArtistDossierContract.discography` and
// Bandcamp standing on its `bandcamp_emergence` / `bandcamp_tastemaker` facets.
import type { components, operations } from './generated/crate-api';

type Schemas = components['schemas'];

// --- Response contracts ---
export type IdentityResolution = Schemas['IdentityResolution'];
export type ArtistDossierContract = Schemas['ArtistDossierContract'];
export type LabelDossierContract = Schemas['LabelDossierContract'];
export type FestivalDossierContract = Schemas['FestivalDossierContract'];
export type DossierManifest = Schemas['DossierManifest'];
export type ApiRootIndex = Schemas['ApiRootIndex'];
/** A link-only artwork cover (`rehost` always false). Carried by the dossiers. */
export type ArtworkItem = Schemas['ArtworkItem'];
export type SearchResponse = Schemas['SearchResponse'];
export type BreakoutsResponse = Schemas['BreakoutsResponse'];
export type FacetCounts = Schemas['FacetCounts'];
export type TastemakersResponse = Schemas['TastemakersResponse'];
export type OnesToWatchResponse = Schemas['OnesToWatchResponse'];
/** One Bandcamp release addressed under its artist — full tracklist (with `duration_s`), artwork, label, tags, economics. Carried by {@link ArtistBandcampReleaseResponse} and listed on `ArtistDossierContract.bandcamp_releases`. */
export type BandcampRelease = Schemas['BandcampRelease'];
/** The `crate.artists()` return — a page of the discovery grid: `state:'present'` rows (or `'degraded'` honest-empty), each row carrying `cluster_id` for the onward dossier. */
export type ArtistBrowseResponse =
  operations['browseArtists']['responses'][200]['content']['application/json'];
/** Filters for `crate.artists()` (`GET /api/v2/artists`). All optional; genre/style are exact (see `crate.facets()`); tier is a closed enum; sort defaults to discovery. */
export interface ArtistBrowseParams {
  genre?: string;
  style?: string;
  tier?: 'breakout' | 'rising' | 'steady';
  sort?: 'discovery' | 'reach';
  limit?: number;
  offset?: number;
}
/** The `crate.aura()` return — per-artist multi-dimension convergence rows, strongest first; `state: 'degraded'` = substrate read failed (items empty, still 200). */
export type AuraIndexResponse =
  operations['getAura']['responses'][200]['content']['application/json'];
/** The `crate.aura.artist()` return — one artist's aura row, or the honest-gap `{ present: false }` (filtered by the universe rule, aged out, or degraded — see `state`). */
export type AuraArtistResponse =
  operations['getAuraByCluster']['responses'][200]['content']['application/json'];
/** The `crate.artistBandcampRelease()` return: `{ present: true, release }` or the cluster-first honest-gap `{ present: false, note }` (release unknown, or filed under a different artist — never another artist's data). */
export type ArtistBandcampReleaseResponse =
  operations['getArtistBandcampRelease']['responses'][200]['content']['application/json'];
/** The `crate.artistMaster()` return: `{ present: true, binding, master }` (the full per-master dossier) or the cluster-first honest-gap `{ present: false, note }` (master unknown, or not filed under this artist — never another artist's dossier). `binding.observed` flags an over-merged name cluster. */
export type ArtistMasterResponse =
  operations['getArtistMaster']['responses'][200]['content']['application/json'];
/** The 429 body shape — distinct from the generic `Error` schema (its `retry_after_seconds` is required). */
export type RateLimited = Schemas['RateLimited'];
/** The `crate.surfaces()` return — the queryable generic-surface registry ledger (cycle-096 / carrefour#135). */
export type SurfaceIndexResponse =
  operations['getSurfaceIndex']['responses'][200]['content']['application/json'];
/** One `crate.surfaces()` row — the complete input contract for `crate.surface(row.name, …)`: grain, key (column/keyspace/wire), keyset (pagination columns, `null` for cluster-row grain), cap, liveness, coverage note. */
export type SurfaceRegistryRow = SurfaceIndexResponse['surfaces'][number];
/** The schema-qualified registry key accepted by `crate.surface(name, …)` — pass verbatim from a `crate.surfaces()` row's `name`. */
export type SurfaceName = operations['getSurfaceRows']['parameters']['path']['name'];
/** The `crate.surface(name, params)` return — a union over every registered surface's row shape, discriminated by `surface`. `state` is `present` (rows), `honest_gap` (0 rows, a normal answer), or `degraded` (still 200, `rows: []` — the read pool/role hasn't landed, not an error). */
export type SurfaceRowsResponse =
  operations['getSurfaceRows']['responses'][200]['content']['application/json'];
/**
 * Params for `crate.surface(name, params)` (`GET /api/v2/surface/{name}`). `cluster` is
 * REQUIRED — the 64-hex identity key in `name`'s registered keyspace (see
 * `crate.surfaces()`'s `key.keyspace`; most surfaces are artist-grain, but
 * `seen.song_station_journey` is keyed on a **recording**-grain cluster). `after` is the
 * opaque cursor from a prior page's `next_after` — pass back verbatim, never construct
 * or decode it; cursors are page-iteration handles, not durable bookmarks.
 */
export interface SurfaceParams {
  cluster: string;
  after?: string;
  limit?: number;
}

// --- Request / body contracts ---
export type ObservedBeaconRequest = Schemas['ObservedBeaconRequest'];
export type RefinedBeaconRequest = Schemas['RefinedBeaconRequest'];

// --- Hand-authored query-param inputs (not named schemas in the spec) ---

/**
 * Faceted search parameters for {@link "crate.search()"} (`GET /api/v2/search`).
 * The faceted params accept a string or string[] (repeat-key serialized, per the
 * spec's `anyOf`); the `*_mode` siblings select facet combination.
 */
export interface SearchParams {
  q?: string;
  genre?: string | string[];
  style?: string | string[];
  format?: string | string[];
  country?: string | string[];
  label?: string | string[];
  cube_quadrant?: string | string[];
  exclude_artist?: string | string[];
  exclude_label?: string | string[];
  genre_mode?: 'and' | 'or';
  style_mode?: 'and' | 'or';
  format_mode?: 'and' | 'or';
  country_mode?: 'and' | 'or';
  label_mode?: 'and' | 'or';
  year_from?: number;
  year_to?: number;
  dj_count_min?: number;
  limit?: number;
  offset?: number;
}
