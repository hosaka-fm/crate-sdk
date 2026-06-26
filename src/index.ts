// @hosaka/crate — the official, typed TypeScript client for the crate public API.
//
// Sprint 1 (foundation) ships the contract-faithful type surface + a value export
// so the dual ESM/CJS build is exercised end-to-end. The `Crate` client, the
// transport/retry/error engine (Sprint 2), and the resource methods (Sprint 3)
// extend this entry point.

/** Package version. Kept in sync with package.json by the release pipeline. */
export const VERSION = '0.1.0';

export * from './types';
