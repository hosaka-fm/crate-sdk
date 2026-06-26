// Public, contract-faithful type re-exports off the generated OpenAPI module.
// Every public method's request AND return type is nameable from the package
// (SDD §2). The generated `operations` object is empty (the spec has no
// operationIds), so these alias `components['schemas']` directly; query-param
// input types are hand-authored in their owning modules (SDD §3.5).
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
