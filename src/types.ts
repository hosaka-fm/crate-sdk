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
