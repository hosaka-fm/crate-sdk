// Public, contract-faithful type re-exports off the generated OpenAPI module (crate /api/v2,
// 2.0.0). Every public method's request AND return type is nameable from the package (SDD §2).
// The spec carries operationIds (since 1.4.0), but we alias `components['schemas']` directly by
// choice — the schema names are the stable, consumer-facing contract; query-param input types
// are hand-authored in their owning modules (SDD §3.5). Cluster-first: master/bandcamp/wayfind/
// usage are demoted in v2; release/master detail lives on `ArtistDossierContract.discography` and
// Bandcamp standing on its `bandcamp_emergence` / `bandcamp_tastemaker` facets.
import type { components } from './generated/crate-api';

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
