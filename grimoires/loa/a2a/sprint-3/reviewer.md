# Sprint 3 Implementation Report — Public surface (client, conveniences, resources, E2E)

## Executive Summary

Sprint 3 completes the full typed public surface over the Sprint 2 transport: the `Crate`
client, the resolve/artist/bandcamp conveniences, all anonymous + key-gated + beacon reads,
the re-exported type aliases, and the self-description surface — plus the contract,
dual-package, JSDoc-gate, and live-smoke tests. All ACs and the agent-ergonomics requirements
(ADX-1, 5, 6, 7, 8, 9, 10) are verified by **74 passing tests** (+1 gated live smoke), and the
SDK was validated **end-to-end against the real public API** (`artist('Four Tet')` →
resolved_via discogs; `index()` → api_index v1; `bandcamp.bulk()` → signals_mbid default).

## AC Verification

1. **resolve: compile + runtime exactly-one-of; discogs coercion; honest-gap passthrough**
   - ✓ `src/identity.ts:33-66` (`ResolveQuery` union, `resolveQueryToParam` exactly-one-of treating `''` as absent), `src/client.ts` `resolve()` (`String()` via `{[key]:value}`). Honest gap passes through (no throw). Tests: `surface.test.ts` resolve suite (bare string, object, empty→`exactly_one_of`, two-id→error, 200+null passthrough). Live: smoke `resolve('Four Tet')`.

2. **artist: HEX64 direct; locator resolve→fetch; not-found vs null; plain name one-hop**
   - ✓ `src/identity.ts:70-78` (`classifyArtistKey`), `src/client.ts` `#artistDossier`. Tests: `surface.test.ts` artist suite (hex direct, plain-name one-hop `/artist/Four%20Tet`, locator two-hop, numeric→discogs (ADX-9), miss→`CrateNotFoundError` / `artistOrNull`→null). Live: `artist('Four Tet')` returned grain artist, resolved_via discogs.

3. **bandcamp: callable + .bulk/.bulkAll/.index; dual-iterable; next_cursor termination; forward-progress + page-shape guards**
   - ✓ `src/pagination.ts` (`makeBulkIterable`), `src/client.ts` bandcamp callable. Tests: `surface.test.ts` bandcamp suite (per-artist, bulkAll across pages→null term, maxPages truncated+resumable cursor (ADX-8), non-advancing cursor→`CratePaginationError`). Live: `bandcamp.bulk({limit:2})` → 2 rows + string cursor.

4. **key-gated: client-side `CrateValidationError` without apiKey; masters arity 1..100**
   - ✓ `src/client.ts` `#requireKey` + masters arity guard. Tests: `surface.test.ts` auth gating (`facets()` no key→`api_key_required` no network; X-API-Key sent with key; masters empty/>100→`masters_arity`).

5. **beacon: require caller `beaconToken`; timestamp default; never retried**
   - ✓ `src/client.ts` `searchEvents.observed/refined` (`requireBeaconToken`, `timestamp ?? new Date().toISOString()`, `idempotent:false`). Tests: `surface.test.ts` beacon suite (missing token→`beacon_token_required`; with token→`Authorization: Bearer` + injected timestamp).

6. **types: alias for every public request+return type; missing-alias test**
   - ✓ `src/types.ts` (returns + request bodies + `SearchParams`), `src/index.ts` re-exports. `contract.test.ts` type-alias suite (`not.toBeAny`, nullable scalars, `RateLimited.retry_after_seconds:number`).

7. **contract test (--typecheck), auth-tier drift**
   - ✓ `contract.test.ts`: `expectTypeOf` (checked by `tsc --noEmit`), `@ts-expect-error` engagement guard, no-global-`security` assertion + per-op `security` tier match for all 23 `CRATE_RESOURCES` entries.

8. **dual-package test (both built artifacts); CI green; tarball excludes src/test/spec**
   - ✓ `dual-package.test.ts` (CJS-thrown error recognized by ESM guards + vice versa, brand survives; `toJSON` cross-format). `ci.yml` builds before test; pack asserts (8 files, no `src/test/spec/scripts/examples`). attw all-green.

### Agent ergonomics (sdd.md §15)
- **ADX-1** bare-string `resolve`/`artist` inference (identity.ts) — tested + live. **ADX-5** JSDoc `@example`+`@throws` on all 10 public Crate methods — enforced by `jsdoc.test.ts` (TS AST gate, 11 tests). **ADX-6** README "Using from an AI agent" + typechecked `examples/agent.ts`. **ADX-7** `VERSION` (==package.json, tested), `CRATE_RESOURCES`, error registries exported. **ADX-8** `.cursor`/`truncated` + `maxPages` clean stop + `CratePaginationError.lastCursor` — tested. **ADX-9** `artist('Four Tet')` pinned (direct one-hop) + numeric→discogs — tested + live; §13 "DX confirm pending" resolved. **ADX-10** public API-surface snapshot golden (`contract.test.ts`).
- Bonus agent-DX fix found during impl: `isCrateError` narrows to the `AnyCrateError` discriminated union so `switch(err.kind)` selects the subclass + its fields (`errors.ts`); validation guards now **reject** rather than throw synchronously (uniform `await…catch`).

## Tasks Completed
`src/client.ts` (Crate + namespaces), `src/identity.ts`, `src/pagination.ts`, `src/resources.ts` (CRATE_RESOURCES), `src/types.ts` (+SearchParams), `src/index.ts`; tests `surface`/`contract`/`dual-package`/`jsdoc`/`smoke`; `examples/agent.ts`; README; `ci.yml` (build-before-test).

## Technical Highlights / Deliberate Decisions
- **Module consolidation** (Karpathy simplicity): thin 1:1 reads live as `Crate` methods + namespace objects rather than separate `resources/*.ts` files; the heavier logic (identity classification, pagination) is isolated. Same surface, fewer files/indirection.
- **Validation rejects, not throws-sync**: methods with client-side guards are `async` so `crate.x().catch()` works uniformly — an agent-DX correctness fix.

## Testing Summary
`npm test` → **74 passed / 1 skipped** across 9 files (errors, retry, http, surface, contract, dual-package, jsdoc, drift; smoke gated). Live smoke + a manual live check both green against the real API. Run: `npm run typecheck && npm run build && npm test && npm run lint && npm run check:exports`.

## Known Limitations
- Beacon JWT auto-wiring is impossible from the public contract (issuance not exposed) — beacon methods require a caller-supplied `beaconToken` (flagged upstream, sdd.md §13).
- `bandcamp.index()` is typed `BandcampBulkPage` per the spec; the no-param response is actually a manifest (spec mistype, flagged upstream).

## Verification Steps (reviewer)
```sh
npm ci && npm run typecheck && npm run build && npm test && npm run lint && npm run check:exports
CRATE_LIVE_SMOKE=1 npx vitest run test/smoke.test.ts   # optional: one live anon call
```
