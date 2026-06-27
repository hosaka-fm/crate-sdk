// Public, contract-faithful type re-exports off the generated OpenAPI module.
// Every public method's request AND return type is nameable from the package
// (SDD §2). The spec carries operationIds (since 1.4.0), but we alias
// `components['schemas']` directly by choice — the schema names are the stable,
// consumer-facing contract; query-param input types are hand-authored in their
// owning modules (SDD §3.5).
import type { components } from './generated/crate-api';

type Schemas = components['schemas'];

// --- Response contracts ---
export type IdentityResolution = Schemas['IdentityResolution'];
export type ArtistDossierContract = Schemas['ArtistDossierContract'];
export type MasterDossierContract = Schemas['MasterDossierContract'];
export type LabelDossierContract = Schemas['LabelDossierContract'];
export type FestivalDossierContract = Schemas['FestivalDossierContract'];
export type DossierManifest = Schemas['DossierManifest'];
export type ApiRootIndex = Schemas['ApiRootIndex'];
export type BandcampBulkPage = Schemas['BandcampBulkPage'];
export type BandcampFeedContract = Schemas['BandcampFeedContract'];
/** Per-release Bandcamp dossier (incl. tracklist). `bandcamp_item_id` is an opaque STRING — never numericize. */
export type BandcampRelease = Schemas['BandcampRelease'];
/** Summary row from `bandcamp.releases({ clusterId })` (no tracks). */
export type BandcampReleaseSummary = Schemas['BandcampReleaseSummary'];
/** The discriminated-union response of `GET /bandcamp/release` (object: bandcamp.release | bandcamp.release_list). */
export type BandcampReleaseResponse = Schemas['BandcampReleaseResponse'];
/** A Bandcamp label reference (`{ name, url }`) on a release/summary (spec 1.4.0). */
export type BandcampLabel = Schemas['BandcampLabel'];
/** Per-release Bandcamp pricing/economics (spec 1.4.0) — present on `BandcampRelease.economics`. */
export type BandcampReleaseEconomics = Schemas['BandcampReleaseEconomics'];
/** A link-only artwork cover (`rehost` always false). `source` includes 'discogs'. */
export type ArtworkItem = Schemas['ArtworkItem'];
export type SearchResponse = Schemas['SearchResponse'];
export type BreakoutsResponse = Schemas['BreakoutsResponse'];
export type FacetCounts = Schemas['FacetCounts'];
export type TastemakersResponse = Schemas['TastemakersResponse'];
export type OnesToWatchResponse = Schemas['OnesToWatchResponse'];
export type MasterEnrichment = Schemas['MasterEnrichment'];
export type BatchResponse = Schemas['BatchResponse'];
export type UsageResponse = Schemas['UsageResponse'];
export type WayfindAnswerResponse = Schemas['WayfindAnswerResponse'];
export type WayfindInterpretResponse = Schemas['WayfindInterpretResponse'];
/** The 429 body shape — distinct from the generic `Error` schema (its `retry_after_seconds` is required). */
export type RateLimited = Schemas['RateLimited'];

// --- Request / body contracts ---
export type ObservedBeaconRequest = Schemas['ObservedBeaconRequest'];
export type RefinedBeaconRequest = Schemas['RefinedBeaconRequest'];
export type WayfindAnswerRequest = Schemas['WayfindAnswerRequest'];
export type WayfindInterpretRequest = Schemas['WayfindInterpretRequest'];

// --- Derived ---
/**
 * One row of a Bandcamp bulk page. The spec leaves row items open
 * (`additionalProperties: {}`), so rows are intentionally `Record<string, unknown>`;
 * `bandcamp.bulkAll<T>()` lets a caller supply a narrower row type.
 */
export type BandcampRow = BandcampBulkPage['rows'][number];
/** One track within a {@link BandcampRelease} (`track_url` is the track PAGE, not a stream — link-only). */
export type BandcampTrack = BandcampRelease['tracks'][number];

// --- Hand-authored query-param inputs (not named schemas in the spec) ---

/**
 * Faceted search parameters for {@link "crate.search()"} (`GET /api/v1/search`).
 * The eight faceted params accept a string or string[] (repeat-key serialized,
 * per the spec's `anyOf`); the `*_mode` siblings select facet combination.
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
