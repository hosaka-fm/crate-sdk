// @hosaka-fm/crate — the official, typed TypeScript client for the crate public API.
//
//   import { Crate } from '@hosaka-fm/crate';
//   const crate = new Crate({ apiKey: process.env.CRATE_API_KEY }); // key-first; only crate.index() is keyless
//   const artist = await crate.artist('Four Tet');
//
// See the README "Using from an AI agent" section for the error-recovery recipes.

/** Package version (kept in sync with package.json; asserted by a test). */
export const VERSION = '1.8.0';

export { Crate } from './client';
export type {
  CrateOptions,
  DossierApi,
  ObservedBeaconInput,
  RefinedBeaconInput,
  RequestOptions,
  SearchEventsApi,
  TastemakersApi,
} from './client';
export type { ResolveQuery } from './identity';
export { CRATE_RESOURCES } from './resources';
export type { CrateResource, CrateResourceName } from './resources';

export * from './types';
export * from './errors';
