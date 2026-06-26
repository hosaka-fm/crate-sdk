# Sprint 2 Implementation Report — Transport core (retry, errors, http funnel)

## Executive Summary

Sprint 2 builds the single shared transport engine every Sprint 3 method will delegate to:
pure retry math (`retry.ts`), the branded 8-class `CrateError` hierarchy with agent-DX
extensions (`errors.ts` + `error-mapping.ts`), and the `http.ts` funnel (URL/query/header
build, retry/timeout/abort loop, body parse, typed-result vs CrateError dispatch). All
acceptance criteria — including agent-ergonomics ADX-2/3/4 — are verified by **35 passing
tests**; typecheck, lint, build, and attw (no dual-package hazard) all green.

## AC Verification

1. **"Retry: 429/500/503/504 retried with full-jitter backoff; Retry-After precedence = header (delta and HTTP-date) > body `retry_after_seconds` > jittered backoff; clamped to `maxRetryAfterMs` and remaining `totalDeadlineMs`"**
   - ✓ Met. `src/retry.ts:9-13` (`RETRYABLE_STATUS`), `:26-33` (`computeDelay` full-jitter), `:42-59` (`parseRetryAfter` delta + HTTP-date). Precedence + clamp in `src/http.ts:217-219` (`serverDelay`) and `:252-262`. Tests: `test/http.test.ts` "retries 503 then succeeds", "honors Retry-After header (delta-seconds)", "falls back to body retry_after_seconds"; `test/retry.test.ts` HTTP-date case.

2. **"No-retry: 400/401/402/404/413 and `AbortError` never retried; beacon POSTs never retried"**
   - ✓ Met. `http.ts:248` (`canRetry = idempotent && isRetryableStatus && attempt<max`). Tests: "does NOT retry 400/401/402/404/413" (asserts 1 call + mapped code/status), "does NOT retry a non-idempotent (beacon) request on 503".

3. **"Idempotency flag set per-request at the method layer"**
   - ✓ Met. `RequestSpec.idempotent` (`http.ts:38`) gates both transport-error retry (`:236`) and status retry (`:248`). Beacon spec passes `idempotent:false` (verified in test).

4. **"Errors: each concrete class sets `kind` + hardcoded `this.name`; all guards brand-based + survive ESM/CJS; `CrateAPIError` carries fields + reads teaching fields defensively"**
   - ✓ Met. `src/errors.ts:203-329` (8 classes, each `this.name` literal + `kind`), `:200` brand on prototype, `:333-388` brand-based guards. Defensive teaching reads: `src/error-mapping.ts:51-74`. Tests: `test/errors.test.ts` "kind discriminant + guards", "brand-based guards recognize every instance (and instanceof still works)".

5. **"429 bodies parsed as `RateLimited`; message composition never trusts `Response.statusText`"**
   - ✓ Met. Reason-phrase table `error-mapping.ts:13-26` (never reads `statusText`); double-space collapse `:61-63`. `retry_after_seconds` read at `:65`. Test: 429 retry tests + "preserves requestId".

6. **"Timeout/abort: per-attempt fresh AbortController + setTimeout cleared in finally; caller signal composed; timeout vs caller-abort disambiguated; listeners removed on settle"**
   - ✓ Met. `http.ts:122-162` (`fetchOnce`): fresh `AbortController`, `setTimeout` cleared in `finally:158-161`, caller-signal listener added/removed, `timedOut` flag disambiguates → `CrateTimeoutError` vs `CrateAbortError`. Tests: "per-attempt timeout → CrateTimeoutError", "caller abort → CrateAbortError".

7. **"Parse: malformed JSON (2xx or error) handling; 204 → undefined; Node-18 missing-fetch guard"**
   - ✓ Met. `http.ts:78-91` (`parseOk`: 204→undefined, 2xx non-JSON→`CrateParseError`), `:97-111` (`readErrorBody`: non-2xx non-JSON → status-based `CrateAPIError` + `.raw`). Node-18 guard lives in the client constructor (Sprint 3) — `node_fetch_missing` code reserved in `errors.ts`. Tests: "204 → undefined", "2xx with invalid JSON → CrateParseError", "non-2xx with non-JSON body → CrateAPIError".

8. **"Pure retry functions unit-tested in isolation; fake timers drive backoff deterministically"**
   - ✓ Met. `test/retry.test.ts` (7 tests, no I/O, injected `rand`/`now`). `test/http.test.ts` uses `vi.useFakeTimers` + `advanceTimersByTimeAsync` + injected `rand:()=>0`.

9. **"Agent ergonomics (ADX-2/3/4)"**
   - ✓ Met. **ADX-2** `CrateError.toJSON()` (`errors.ts:184-198`) → stable `CrateErrorJSON`, excludes `.raw`/raw `.cause`; test "ADX-2: toJSON envelope is JSON-safe" (round-trips kind/code/status/etc.; `.raw` absent; `.cause`→`{name,message}`). **ADX-3** `CRATE_ERROR_KINDS`/`CrateErrorKind`/`CrateErrorCode`/`CRATE_ERROR_CODES`/`CRATE_ERROR_REGISTRY` exported (`errors.ts:14-116`); test "ADX-3: exported taxonomy" (kinds == class kinds; registry retryable matches instances; client codes present). **ADX-4** client-side classes require `hint`+`next` at the type level (`CrateValidationError:296`, `CrateNotFoundError:305`, `CratePaginationError:313`); test "ADX-4: client-side errors author the fix".

## Tasks Completed
| Task | Files |
|------|-------|
| 2.1 retry.ts (pure) | `src/retry.ts` + `test/retry.test.ts` (7) |
| 2.2 errors.ts + ADX-2/3/4 | `src/errors.ts` + `test/errors.test.ts` (10) |
| 2.3 message composition + status mapping | `src/error-mapping.ts` |
| 2.4 http.ts core | `src/http.ts` |
| 2.5 http.ts retry/timeout loop | `src/http.ts` |
| 2.6 transport unit suite | `test/http.test.ts` (16) |

## Technical Highlights / Deliberate Decisions
- **Test seam**: S2 unit tests inject `fetchImpl` (the SDD's `fetch?` seam) for deterministic timing rather than undici MockAgent; the real default-`fetch` path + MockAgent land in the Sprint 3 client integration + dual-package tests. Same `http.ts` code path either way.
- **Non-2xx non-JSON → `CrateAPIError` (status preserved), not `CrateParseError`** (a refinement of a literal SDD §4 reading): the HTTP status is the load-bearing signal for an agent; we keep `.raw` and surface the status-based error. 2xx non-JSON still throws `CrateParseError` (can't return garbage as typed data).

## Testing Summary
`npm test` → 35 tests across `retry`/`errors`/`http`/`drift`, all passing, no network (fake timers + injected fetch). Run: `npm run typecheck && npm test && npm run lint && npm run build && npm run check:exports`.

## Known Limitations
- The `Crate` client wiring (which constructs `HttpConfig` from `CrateOptions`, sets per-request `idempotent`, and the Node-18 fetch guard) lands in Sprint 3.

## Verification Steps (reviewer)
```sh
npm ci && npm run typecheck && npm test && npm run lint && npm run build && npm run check:exports
```
