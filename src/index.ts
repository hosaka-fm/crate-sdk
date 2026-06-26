// @hosaka/crate — the official, typed TypeScript client for the crate public API.
//
//   import { Crate } from '@hosaka/crate';
//   const crate = new Crate();                 // apiKey optional (public surface is anonymous today)
//   const artist = await crate.artist('Four Tet');
//
// See the README "Using from an AI agent" section for the error-recovery + pagination recipes.

/** Package version (kept in sync with package.json; asserted by a test). */
export const VERSION = '0.2.0';

export { Crate } from './client';
export type {
  BandcampApi,
  CrateOptions,
  DossierApi,
  ObservedBeaconInput,
  RefinedBeaconInput,
  RequestOptions,
  SearchEventsApi,
  TastemakersApi,
  WayfindApi,
} from './client';
export type { BandcampBulkParams, BulkIterable } from './pagination';
export type { ResolveQuery } from './identity';
export { CRATE_RESOURCES } from './resources';
export type { CrateResource, CrateResourceName } from './resources';

export * from './types';
export * from './errors';
