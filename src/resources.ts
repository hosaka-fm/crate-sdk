// Machine-readable self-description of the SDK surface (agent-ergonomics ADX-7).
// One entry per public method: an agent can read the auth tier, endpoint, return
// type, and retry/idempotency without source access. Single-sourced against the
// SDD §3 surface table; a contract test asserts it matches the live spec's
// effective security (doc-level ApiKeyAuth default; only index + openapi are public).
//
// crate is KEY-FIRST as of cycle-078 (spec 1.1.0): every data endpoint requires
// X-API-Key; only `index` is anonymous; beacons use a per-search bearer token.

export interface CrateResource {
  readonly method: 'GET' | 'POST';
  readonly endpoint: string;
  readonly returns: string;
  /** Auth tier: anonymous, X-API-Key, or per-search beacon JWT. */
  readonly auth: 'anon' | 'key' | 'beacon';
  /** Whether the SDK auto-retries this method on a retryable status. */
  readonly retryable: boolean;
  /** Whether the method is safe to retry (read-shaped). */
  readonly idempotent: boolean;
}

export const CRATE_RESOURCES = Object.freeze({
  resolve: {
    method: 'GET',
    endpoint: '/api/v1/resolve',
    returns: 'IdentityResolution',
    auth: 'key',
    retryable: true,
    idempotent: true,
  },
  artist: {
    method: 'GET',
    endpoint: '/api/v1/artist/{key}',
    returns: 'ArtistDossierContract',
    auth: 'key',
    retryable: true,
    idempotent: true,
  },
  bandcamp: {
    method: 'GET',
    endpoint: '/api/v1/bandcamp/{artistKey}',
    returns: 'BandcampFeedContract',
    auth: 'key',
    retryable: true,
    idempotent: true,
  },
  'bandcamp.bulk': {
    method: 'GET',
    endpoint: '/api/v1/bandcamp',
    returns: 'BandcampBulkPage',
    auth: 'key',
    retryable: true,
    idempotent: true,
  },
  'bandcamp.index': {
    method: 'GET',
    endpoint: '/api/v1/bandcamp',
    returns: 'BandcampBulkPage',
    auth: 'key',
    retryable: true,
    idempotent: true,
  },
  search: {
    method: 'GET',
    endpoint: '/api/v1/search',
    returns: 'SearchResponse',
    auth: 'key',
    retryable: true,
    idempotent: true,
  },
  breakouts: {
    method: 'GET',
    endpoint: '/api/v1/breakouts',
    returns: 'BreakoutsResponse',
    auth: 'key',
    retryable: true,
    idempotent: true,
  },
  tastemakers: {
    method: 'GET',
    endpoint: '/api/v1/tastemakers',
    returns: 'TastemakersResponse',
    auth: 'key',
    retryable: true,
    idempotent: true,
  },
  'tastemakers.onesToWatch': {
    method: 'GET',
    endpoint: '/api/v1/tastemakers/ones-to-watch',
    returns: 'OnesToWatchResponse',
    auth: 'key',
    retryable: true,
    idempotent: true,
  },
  'dossier.master': {
    method: 'GET',
    endpoint: '/api/v1/dossier/master/{id}',
    returns: 'MasterDossierContract',
    auth: 'key',
    retryable: true,
    idempotent: true,
  },
  'dossier.artist': {
    method: 'GET',
    endpoint: '/api/v1/dossier/artist/{slug}',
    returns: 'ArtistDossierContract',
    auth: 'key',
    retryable: true,
    idempotent: true,
  },
  'dossier.label': {
    method: 'GET',
    endpoint: '/api/v1/dossier/label/{slug}',
    returns: 'LabelDossierContract',
    auth: 'key',
    retryable: true,
    idempotent: true,
  },
  'dossier.festival': {
    method: 'GET',
    endpoint: '/api/v1/dossier/festival/{slug}',
    returns: 'FestivalDossierContract',
    auth: 'key',
    retryable: true,
    idempotent: true,
  },
  'dossier.manifest': {
    method: 'GET',
    endpoint: '/api/v1/dossier/manifest',
    returns: 'DossierManifest',
    auth: 'key',
    retryable: true,
    idempotent: true,
  },
  index: {
    method: 'GET',
    endpoint: '/api/v1',
    returns: 'ApiRootIndex',
    auth: 'anon',
    retryable: true,
    idempotent: true,
  },
  wayfind: {
    method: 'POST',
    endpoint: '/api/v1/wayfind/answer',
    returns: 'WayfindAnswerResponse',
    auth: 'key',
    retryable: true,
    idempotent: true,
  },
  facets: {
    method: 'GET',
    endpoint: '/api/v1/facets',
    returns: 'FacetCounts',
    auth: 'key',
    retryable: true,
    idempotent: true,
  },
  master: {
    method: 'GET',
    endpoint: '/api/v1/masters/{id}',
    returns: 'MasterEnrichment',
    auth: 'key',
    retryable: true,
    idempotent: true,
  },
  masters: {
    method: 'POST',
    endpoint: '/api/v1/masters/batch',
    returns: 'BatchResponse',
    auth: 'key',
    retryable: true,
    idempotent: true,
  },
  usage: {
    method: 'GET',
    endpoint: '/api/v1/usage',
    returns: 'UsageResponse',
    auth: 'key',
    retryable: true,
    idempotent: true,
  },
  'wayfind.interpret': {
    method: 'POST',
    endpoint: '/api/v1/wayfind/interpret',
    returns: 'WayfindInterpretResponse',
    auth: 'key',
    retryable: true,
    idempotent: true,
  },
  'searchEvents.observed': {
    method: 'POST',
    endpoint: '/api/v1/search-events/observed',
    returns: 'void',
    auth: 'beacon',
    retryable: false,
    idempotent: false,
  },
  'searchEvents.refined': {
    method: 'POST',
    endpoint: '/api/v1/search-events/refined',
    returns: 'void',
    auth: 'beacon',
    retryable: false,
    idempotent: false,
  },
} satisfies Record<string, CrateResource>);

export type CrateResourceName = keyof typeof CRATE_RESOURCES;
