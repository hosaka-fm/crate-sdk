# SDD — `@hosaka/crate` (official crate TypeScript client SDK)

> **Inputs**: `prd.md` (lean requirements anchor), `design-verify-synthesis.md` (29-agent adversarial design-verify, jq-grounded in the live contract), `context/crate-api-handoff.md` (handoff), live spec `https://crate.0xhoneyjar.xyz/api/v1/openapi.json` (OpenAPI 3.1, info.version 1.0.0).
> **Scope**: V1 = **full public surface** (jani) — conveniences + anonymous reads + key-gated reads + beacon endpoints. Build/test/tag only; **publish gated OFF** until crate's API key model lands.
> **Thickness**: MEDIUM (stripe-node / @supabase/supabase-js sweet spot).

---

## 1. Architecture Overview

A thin, typed, zero-runtime-dependency client over crate's public REST contract. One `Crate` instance holds config; every method is a typed wrapper that builds a URL, delegates to a single shared transport (`http.ts`) that owns auth headers, timeout, retry, and error mapping, and returns a generated response type or throws a typed `CrateError`.

```
Crate (client.ts)            public surface; wires methods + namespaces; holds config
 ├─ http.ts                  transport: URL build, header merge, fetch, retry loop, timeout, body parse → typed result | throw
 │   ├─ retry.ts             PURE: isRetryable(), computeDelay(), parseRetryAfter()  (no I/O, unit-tested in isolation)
 │   └─ errors.ts            CrateError hierarchy + Symbol brand + type guards
 ├─ resolve.ts               resolve() + exactly-one-of validation
 ├─ artist.ts                artist() / artistOrNull() convenience (resolve→dossier)
 ├─ bandcamp.ts              callable function-object: bandcamp() + .bulk()/.bulkAll()/.index()
 ├─ resources/*.ts           thin 1:1 reads (search, breakouts, tastemakers, facets, dossier, masters, usage, wayfind, index, search-events)
 ├─ types.ts                 narrow public aliases off generated components['schemas'] (ALL method return types)
 └─ generated/crate-api.d.ts openapi-typescript output (COMMITTED)
spec/openapi.json             vendored byte-pinned snapshot (drift source of truth)
scripts/{generate-types,check-spec-staleness}.mjs
test/*.test.ts                unit + contract (--typecheck) + dual-package + live smoke
tsup.config.ts · vitest.config.ts · tsconfig.json · .gitattributes · LICENSE
.github/workflows/{ci,release,spec-staleness}.yml
```

**Design principles** (from the handoff + synthesis): consume the **public contract only**; build conveniences on **documented body fields** (`cluster_id`/`slug`/`next_cursor`), never undocumented `_links`; surface honesty fields (`resolved_via`/`resolved_from`/`matched_on`/`note`) verbatim; fail closed (publish gate, auth-required guards).

## 2. Type Generation & Drift Strategy

**Generation**: `openapi-typescript@7.13.0` (EXACT-pinned, not `^7`) emits `src/generated/crate-api.d.ts` from the **vendored** `spec/openapi.json`. Committed. The spec has **0 operationIds**, so the generated `operations` object is **empty and unusable**. All 20 typed 2xx responses are pure `$ref`s into `components['schemas']`, so **method return types alias `components['schemas']` directly** (no path-indexing plumbing). **Query-param input types** (search facets, bandcamp-bulk params) are *not* named schemas, so type those by **path+verb indexing** into `paths` (e.g. `paths['/api/v1/search']['get']['parameters']['query']`) behind the hand-authored `SearchParams`/`BandcampBulkParams` interfaces.

**`src/types.ts`** re-exports narrow aliases for **every public-method request *and* return type** (de-duplicated):
- **Returns**: `IdentityResolution`, `ArtistDossierContract`, `ApiRootIndex`, `BandcampBulkPage`, `BandcampFeedContract`, `SearchResponse`, `BreakoutsResponse`, `FacetCounts`, `TastemakersResponse`, `OnesToWatchResponse`, `MasterEnrichment`, `BatchResponse`, `MasterDossierContract`, `LabelDossierContract`, `FestivalDossierContract`, `DossierManifest`, `UsageResponse`, `WayfindAnswerResponse`, `WayfindInterpretResponse`, `RateLimited` (the 429 body, distinct from `Error`).
- **Request/body**: `ObservedBeaconRequest`, `RefinedBeaconRequest`, `WayfindAnswerRequest`, `WayfindInterpretRequest`, plus hand-authored `SearchParams` + `BandcampBulkParams`.
- `BandcampRow = BandcampBulkPage['rows'][number]` — resolves to `Record<string, unknown>` because the spec leaves row items open (`additionalProperties:{}`); rows are **intentionally untyped**, and `bulkAll<T = Record<string,unknown>>()` lets callers supply their own row type.

**Two-tier drift guard**:
- **Tier 1 — offline byte-equality (GATES PR CI)**: `scripts/generate-types.mjs` regenerates from the vendored spec via the *same pinned binary*, to a temp file; the test does `git diff --no-index --exit-code` against the committed `crate-api.d.ts`. Catches stale-spec, hand-edits, and tool drift in one assertion. Deterministic, no network.
- **Tier 2 — live-spec staleness (SCHEDULE ONLY, never gates PRs)**: `scripts/check-spec-staleness.mjs` fetches the live spec, compares `sha256(JCS(spec))` against `meta.json` (JCS used in **both** sides — unified hashing). On drift, opens a regen issue. `.github/workflows/spec-staleness.yml` (nightly + manual).
- `.gitattributes`: `*.d.ts` and `openapi.json` → `text eol=lf`; committed lockfile + `npm ci` for byte reproducibility.

**Contract test** (`vitest --typecheck`): `expectTypeOf(...).not.toBeAny()` on every alias (`BandcampRow` asserted `.not.toBeAny()` only — no rich shape, it's `Record<string,unknown>`); `toEqualTypeOf` for nullable scalars (`cluster_id`/`slug`/`display`: `string|null`; `locators.discogs`: `number|null`; `resolved_via`; `next_cursor`: `string|null`) and `RateLimited.retry_after_seconds: number` (§5's body-fallback floor); a guarded `@ts-expect-error` proves `--typecheck` actually engaged (can't silently no-op); a test that fails if any public-method **request or return** schema lacks an exported alias.

## 3. Public Client Surface

Constructor and per-call options:

```ts
export interface CrateOptions {
  apiKey?: string;                  // → X-API-Key header (only when present). Format ck_(live|test)_… NOT validated client-side (optional dev warning only).
  baseUrl?: string;                 // default 'https://crate.0xhoneyjar.xyz'. ORIGIN-ONLY — throws if it has a path (new URL('/api/v1'+p, base) silently drops base paths).
  fetch?: typeof globalThis.fetch;  // injectable (tests); defaults to global fetch (Node 18+).
  timeout?: number;                 // per-attempt timeout ms, default 30000 (the public name for perAttemptTimeoutMs). per-call override.
  maxRetries?: number;              // default 2 (= retries, not total sends — matches stripe-node). 0 disables.
  maxBackoffMs?: number;            // jitter cap, default 8000.
  maxRetryAfterMs?: number;         // clamp on server-directed Retry-After, default 60000.
  totalDeadlineMs?: number | null;  // whole-call budget across retries, default 120000; null to opt out.
  headers?: Record<string,string>;  // extra defaults, merged UNDER SDK-managed headers.
}
export interface RequestOptions {   // per-call overrides of the above retry/timeout knobs
  signal?: AbortSignal;             // caller cancel; composed with internal per-attempt timeout.
  timeout?: number; maxRetries?: number; maxBackoffMs?: number; maxRetryAfterMs?: number;
  totalDeadlineMs?: number | null; headers?: Record<string,string>;
}
```

`/api/v1` is an internal constant (`API_PREFIX`), not part of `baseUrl`. `X-API-Key` set only when `apiKey` present.

**Surface map** (auth column verified per-op against the spec):

| Method | Endpoint | Returns | Auth |
|---|---|---|---|
| `resolve(q, opts?)` | `GET /resolve` | `IdentityResolution` | anon |
| `artist(key, opts?)` / `artistOrNull(key, opts?)` | `GET /artist/{key}` (+resolve for locators) | `ArtistDossierContract` / `…\|null` | anon |
| `bandcamp(artistKey, opts?)` | `GET /bandcamp/{artistKey}` | `BandcampFeedContract` | anon |
| `bandcamp.bulk(params?, opts?)` | `GET /bandcamp?source=&cursor=&limit=` | `BandcampBulkPage` | anon |
| `bandcamp.bulkAll(params?, opts?)` | (auto-paginates) | `AsyncIterable<BandcampRow>` + `.pages()` | anon |
| `bandcamp.index(opts?)` | `GET /bandcamp` (no params) | manifest¹ | anon |
| `search(params?, opts?)` | `GET /search` | `SearchResponse` | anon |
| `breakouts(opts?)` | `GET /breakouts` | `BreakoutsResponse` | anon |
| `tastemakers(opts?)` / `tastemakers.onesToWatch(opts?)` | `GET /tastemakers[/ones-to-watch]` | `TastemakersResponse` / `OnesToWatchResponse` | anon |
| `dossier.master(id)/artist(slug)/label(slug)/festival(slug)` | `GET /dossier/{grain}/{key}` | `*DossierContract` | anon |
| `dossier.manifest(opts?)` | `GET /dossier/manifest` | `DossierManifest` | anon |
| `index(opts?)` | `GET /api/v1` | `ApiRootIndex` | anon |
| `wayfind(question, opts?)` | `POST /wayfind/answer` | `WayfindAnswerResponse` | anon (can 402) |
| `facets(opts?)` | `GET /facets` | `FacetCounts` | **key** |
| `master(id, opts?)` | `GET /masters/{id}` | `MasterEnrichment` | **key** |
| `masters(ids, opts?)` | `POST /masters/batch` (≤100 ids) | `BatchResponse` | **key** |
| `usage(opts?)` | `GET /usage` | `UsageResponse` | **key** |
| `wayfind.interpret(q, opts?)` | `POST /wayfind/interpret` | `WayfindInterpretResponse` | **key** |
| `searchEvents.observed(body, opts?)` / `searchEvents.refined(body, opts?)` | `POST /search-events/{observed\|refined}` | `void` (204) | **beacon JWT** |

¹ The no-param `/bandcamp` returns a discovery manifest but is **mistyped as `BandcampBulkPage` in the spec** (flag upstream §13). `bandcamp.index()` returns it typed as the spec declares, so consumers can discover valid `source` names for `bulk`.

**Key-gated methods** (`facets`, `master`, `masters`, `usage`, `wayfind.interpret`): throw a client-side `CrateError{ kind:'validation' }` immediately if called without `apiKey` — fail fast instead of a confusing runtime 401/402. (All anonymous DX examples must avoid these.)

### 3.1 `resolve()` — exactly-one identifier
Discriminated union makes wrong arity a **compile** error; a runtime guard backs JS callers:
```ts
export type ResolveQuery = {url:string}|{q:string}|{cluster:string}|{discogs:string|number}|{mbid:string};
resolve(query: ResolveQuery, opts?: RequestOptions): Promise<IdentityResolution>;
```
Runtime: count non-null keys; `!== 1` → `CrateError{kind:'validation'}`. `discogs` coerced via `String()`. **Never throws on honest-gap**: a 200 with `cluster_id`/`slug`/`display = null` passes straight through (the caller inspects `note`/`resolved_via`).

### 3.2 `artist()` — resolve→dossier convenience
Detection is purely syntactic, matching what `/artist/{key}` accepts:
```ts
const HEX64 = /^[0-9a-f]{64}$/i;  const LOCATOR = /^(discogs|mbid):/i;
```
1. `HEX64` → direct `GET /artist/{key}` (cluster_id).
2. `LOCATOR` (`discogs:`/`mbid:`) → **not** a canonical address; `resolve()` first (strip scheme), then `GET /artist/{cluster_id}`. If `resolve` yields `cluster_id == null` → honest gap: `artist()` throws `CrateError{kind:'not_found'}` (carrying the resolve `note`); `artistOrNull()` returns `null`.
3. otherwise (slug **or** plain name) → direct `GET /artist/{key}` — one hop; the endpoint name-resolves natively and returns the dossier with `identity` (possibly `null` inner, which is the contract's honest gap, surfaced verbatim — the SDK does not second-guess it). *(DX confirm pending §13.)*

`artistOrNull()` is a **separate method**, not an `onGap` overload — overloads on a dynamically-built options object trip TS2769; a separate method keeps inference stable.

### 3.3 `bandcamp` — callable function-object
Built once in the constructor (no class, no Proxy): a function with `.bulk`, `.bulkAll`, `.index` properties (call signature + props interface). `bandcamp('<hex|discogs:…|mbid:…>')` → per-artist feed; see §6 for pagination.

### 3.4 Beacon (`searchEvents.*`)
`BeaconBearerAuth` = a per-search JWT sent as `Authorization: Bearer <token>`, **distinct from `X-API-Key`**, bound to a `search_event_id`. **The public contract does not expose how this token is issued** (`SearchResponse` carries no token/`search_event_id`, search 200 has no headers) — so the SDK **cannot auto-wire it**. The beacon methods therefore require the caller to pass the token explicitly:
```ts
searchEvents.observed(body: ObservedBeaconRequest, opts?: RequestOptions & { beaconToken: string }): Promise<void>;
searchEvents.refined(body: RefinedBeaconRequest, opts?: RequestOptions & { beaconToken: string }): Promise<void>;
```
Missing `beaconToken` → client-side `CrateError{kind:'validation'}`. `timestamp` defaults to current ISO time if omitted (beacon bodies are clock-sensitive — `BeaconError.skew_ms`; documented). **Not retried** (POST, non-idempotent telemetry). Issuance gap flagged upstream §13.

### 3.5 Typed inputs & client-side validation
**`SearchParams`** (hand-authored off `GET /search` query params): `q?: string`; the **eight faceted params** `genre`/`style`/`format`/`country`/`label`/`cube_quadrant`/`exclude_artist`/`exclude_label` each `string | string[]` (spec `anyOf` string|array — arrays serialize by **repeat-key**, pinned in the §4 test); the five `*_mode` siblings (`genre_mode`/`style_mode`/`format_mode`/`country_mode`/`label_mode`) `'and' | 'or'`; `year_from?`/`year_to?`/`dj_count_min?`/`limit?`/`offset?: number` (serialized to strings). **`BandcampBulkParams`**: `source?: string` (omit → server default), `cursor?: string | null`, `limit?: number` (client clamp 1..200, documented as description-only).

**Client-side validation** (fail-fast, same `CrateValidationError` pattern as the key-gated/beacon guards):
- `masters(ids)`: throw if `ids.length < 1` or `> 100` (spec `minItems:1, maxItems:100`). Per-id positive-integer bound (`1..2_000_000_000`) is **server-enforced** (→ 400/413), not duplicated client-side.
- `master(id)` / `dossier.master(id)`: `id` is a positive integer ≤ 2_000_000_000 — **server-validated** (→ 400); no client-side range check.

## 4. Transport (`http.ts`)

Single entry the whole surface funnels through. Responsibilities, in order:
1. **URL**: `new URL(API_PREFIX + path, baseUrl)`; serialize query via `URLSearchParams` (numbers → strings; array facets repeat the key). Pin serialization in a test (`+` vs `%20`).
2. **Headers** (precedence high→low): SDK-managed (`X-API-Key`, `Authorization: Bearer` for beacon, `Accept: application/json`, `Content-Type` for POST) > per-call `headers` > constructor `headers`.
3. **Node-18 guard**: if `globalThis.fetch` is undefined and no `fetch` injected → teaching `CrateError` ("Node 18+ or a fetch polyfill required").
4. **Retry loop** (§5) wrapping fetch; per-attempt timeout (§5).
5. **Body parse**: single `response.text()` then `JSON.parse` in try/catch → on failure `CrateError{kind:'parse'}` (applies to **both** 2xx and error bodies); 204 → `undefined`.
6. **Dispatch**: 2xx → typed JSON; non-2xx → map to `CrateError` (§7).

`baseUrl` validated origin-only at construction (throw if it has a path).

## 5. Retry & Backoff (`retry.ts` pure + `http.ts` loop)

- **Retryable status superset** = `{429, 500, 503, 504}`, applied uniformly as a **safe over-approximation** (per-op declarations are subsets — e.g. `wayfind/interpret`={429,503}, `dossier/manifest`={429,500}, `usage` has no 503/504). **Never** retry `400/401/402/404/413` or `AbortError`.
- **Idempotency** via an explicit per-request boolean set at the method layer: GETs + read-shaped POSTs (`masters/batch`, `wayfind/*`) = retryable; **beacons = false**. (POSTs only retry on the retryable statuses above + pre-send network errors.)
- **Backoff**: full-jitter exponential. **Retry-After precedence**: header (delta-seconds **or** HTTP-date) > body `retry_after_seconds` > jittered backoff. Validate non-finite/negative server values → fall through to backoff. Apply jitter on top of server-directed delays (anti-thundering-herd). Clamp to `maxRetryAfterMs` **and** remaining `totalDeadlineMs`.
- **Config naming** (stripe-aligned), all exposed on `CrateOptions` + per-call `RequestOptions` (§3): `maxRetries` (retry count), `maxBackoffMs` (jitter cap), `maxRetryAfterMs` (server-directed clamp), `totalDeadlineMs` (**finite default 120000**, `null` to opt out); `perAttemptTimeoutMs` is the internal name for the public `timeout` (single source of truth).
- **Header caveat**: the spec declares **zero response headers** anywhere (`Retry-After` + `X-RateLimit-*` are prose-only on the 429 description; no `X-Request-Id`). So the header tier of Retry-After precedence + `.requestId` are **runtime-best-effort upgrades**; the **contract-guaranteed floor** is the `RateLimited` body's required `retry_after_seconds`. Header-first ordering is intentional, not an assumption that the header is reliable.
- **Timeout/abort**: per attempt a fresh `AbortController` + `setTimeout` **cleared in `finally`** (NOT `AbortSignal.timeout` — uncancelable, leaks timers, and fake-timer-untestable). Compose with caller `signal`; disambiguate timeout vs caller-abort via `signal.reason` (→ `CrateTimeoutError` vs `CrateAbortError`). Remove listeners on settle (no accumulation across retries on a long-lived caller signal).

## 6. Pagination (`bandcamp.bulk`)

One **dual-iterable** handle from `bulkAll()`: default `for await` yields **rows** (`BandcampRow = Record<string,unknown>` — spec row items are open; `bulkAll<T>()` accepts a caller-supplied row type), `.pages()` yields whole `BandcampBulkPage` objects (for `_meta`: `k_anon_floor`/`note`/`generated_at`) — both share one page generator.
- `source` **optional** (omit → server applies its documented `signals_mbid` default; never force a magic string). Validate non-empty if provided.
- Loop driven **solely** by `next_cursor`; terminate on `null`. **No `_links.next`** (absent from schema).
- **Forward-progress guard**: throw `CrateError{kind:'pagination'}` if `next_cursor` equals the cursor just used or a previously-seen cursor (prevents infinite loop on non-advancing/cycling cursors); optional `maxPages` cap.
- **Page-shape validation** before iterating: `Array.isArray(page.rows)` and `next_cursor` is `string|null` else `CrateError` (malformed 200 must not leak a raw `TypeError`).
- `limit` sent as a string query param (schema is bare `type:string`); the `1..200` bound is **description-only folklore** — keep a client clamp but document it as such. All guards live **inside** the generator so every error surfaces at the same `.next()` site. Check `signal.aborted` at the top before the first fetch; silent cleanup (no throw-in-finally).

## 7. Error Model (`errors.ts`)

`CrateError extends Error` is the **abstract root**. It carries a **`kind` discriminant** (`'api'|'network'|'timeout'|'abort'|'validation'|'parse'|'pagination'|'not_found'`) so callers can branch without `instanceof`. Every concrete class sets `kind`, a hardcoded `this.name` literal, and inherits the brand + guards:

| Class | `kind` | Thrown when | Carries |
|---|---|---|---|
| `CrateAPIError` | `api` | non-2xx response | full API fields (below) |
| `CrateNetworkError` | `network` | pre-response transport failure | `.cause` |
| `CrateTimeoutError` | `timeout` | per-attempt / total-deadline timeout | `.timeoutMs` |
| `CrateAbortError` | `abort` | caller-initiated abort (`signal.reason`) | `.cause` |
| `CrateValidationError` | `validation` | client-side guard: exactly-one-of (`resolve`), missing `apiKey` on a key-gated method, missing `beaconToken`, `masters()` arity | — |
| `CrateNotFoundError` | `not_found` | `artist()` locator resolves to `null` cluster_id (honest gap) | resolve `note` |
| `CrateParseError` | `parse` | response body not valid JSON (2xx **or** error) | `.status`, `.raw` |
| `CratePaginationError` | `pagination` | bulk: non-advancing/repeated cursor, or malformed page shape | last cursor |

The four client-side kinds (`validation`/`not_found`/`pagination`, and `parse` aside from `.status`/`.raw`) have no HTTP fields. **`CrateAPIError` fields**: `.code` (body `error`, the **only** required body field), `.status`, `.retryable` (status ∈ retry set), `.details[]`, `.retryAfter`, `.masterId`, `.requestId` (best-effort header), `.raw` (~2KB body escape hatch). **Teaching fields** (`.hint`, `.docUrl`, `.next`, `.param`, richer `.message`) read **defensively** — populated only when present + correctly typed at runtime (spec `Error` schema is open and doesn't declare them). **429 bodies conform to `RateLimited`** (`error:'rate_limited'`, **required** `retry_after_seconds`); other non-2xx use `Error`. Status mapping: 401 / 402 (payment required — past_due/suspended key) / 404 / 413 / 429 (rate-limited, carries `.retryAfter`).

**Cross-cutting (adversarial fixes)**:
- **`this.name`** hardcoded string literal per subclass (NOT `new.target.name` — minifiers mangle it; garbage `.name`/stack traces in consumers' bundlers).
- **Dual-package `instanceof` hazard**: `Symbol.for('hosaka.crate.error')` brand on the prototype; **all guards are brand-based** — `isCrateError`, `isCrateAPIError`, `isCrateNetworkError`, `isCrateTimeoutError`, `isCrateAbortError`, `isCrateValidationError`, `isCrateNotFoundError`, `isCrateParseError`, `isCratePaginationError`, `isRateLimited`, `isRetryable` — surviving ESM/CJS duplication. Docs: prefer guards over `instanceof`.
- `super(message, { cause })` native (typed, non-enumerable) — no `(this as any).cause`.
- **Message composition** must NOT trust `Response.statusText` (empty over HTTP/2 + Cloudflare): status→reason-phrase table; deterministic fallback when body has only `{error}`; collapse double spaces.

> Throw-sites elsewhere in this SDD written as `CrateError{kind:'…'}` are shorthand for the matching concrete class in the table above.

## 8. Build & Packaging

- **Tool**: `tsup` (esbuild; **devDependency only** → zero runtime deps). `format:['esm','cjs']` + `dts:true` → `index.js`/`index.cjs` + `index.d.ts`/`index.d.cts`, wired per `exports` condition; `@arethetypeswrong/cli`-clean.
- **`package.json`**: `exports` with `types` first then `import`/`require`/`default` per condition; `engines.node>=18`; `sideEffects:false`; `files:[dist,README,LICENSE]`. **`private:true`** (fail-closed publish gate). `prepack` runs the build (not `prepublishOnly`).
- **LICENSE**: **MIT** (jani, 2026-06-26). Official clients of paid/commercial APIs are conventionally permissive (stripe-node, @supabase/supabase-js are MIT) — the client code is open; paid access stays gated by crate's terms + API key. Ship an MIT `LICENSE`; `package.json` `license:"MIT"`. Publish stays gated via `private:true` until keys land. The spec's `info.license.name = "Commercial — see Terms of Service"` describes the **API**, not this client. **Shippable disclosure (load-bearing — makes the MIT choice defensible)**: the README MUST carry a notice — *"MIT covers this client library's source. Access to the crate API is governed separately by crate's Terms of Service and requires a valid API key; MIT grants no right to use the crate service."* — and the same one-line notice is prepended to `LICENSE` (or shipped as a `NOTICE` file added to `files:[]`).
- **Pins**: `openapi-typescript@7.13.0` exact (caret defeats the byte-drift gate), `typescript` tight, `@arethetypeswrong/cli` exact; commit lockfile.
- **Node-18 fetch**: rely on global `fetch`; constructor guard throws a teaching error on older runtimes.

## 9. Testing (`vitest`)

- **Runner**: vitest. **Mock layer**: `undici` `MockAgent` via `setGlobalDispatcher` (`disableNetConnect`, `assertNoPendingInterceptors`) — intercepts the real undici-backed global fetch at the dispatcher layer (devDep; NOT msw/nock/fetch-stub). **Fake timers**: `vi.useFakeTimers` + `advanceTimersByTimeAsync` (works because timeout uses `setTimeout`+`AbortController`).
- **Fixtures schema-grounded** (`locators.discogs` is `number|null` not string; `resolved_via ∈ {discogs,cluster,null}`), self-validated against the schema. Intercepts assert **full `/api/v1/…` paths**.
- **Coverage** (each a named acceptance test): retry on 429/500/503/504 incl. `Retry-After` header (delta **and** HTTP-date) + body fallback + backoff math (pure-fn unit); no-retry on 400/401/402/404/413/abort; pagination across multiple cursor pages + null-termination + non-advancing-cursor guard + partial-page (page2→500) clean throw + 200-with-invalid-JSON; error mapping (teaching body, non-JSON body, network, timeout vs caller-abort via `signal.reason`); resolve exactly-one-of; resolve honest-gap (200 null) passthrough; `artist` hex/slug/locator paths + locator-miss `artist` throw / `artistOrNull` null; `X-API-Key` presence/absence; key-gated methods without key → client-side error; beacon missing token → client-side error; consumer `AbortSignal` composition + listener-cleanup bound; concurrent-call independent retry state; query-serialization pin; **dual-package test** importing **both** built artifacts (`require('../dist/index.cjs')` + `import('../dist/index.js')`) asserting brand/guard work cross-format.
- **Live smoke** (`CRATE_LIVE_SMOKE=1`): a single anonymous call (e.g. `resolve({q})`) on **one runner only** (never the build matrix), routed **through the SDK's retry path** so a 429 is handled rather than failing the job; respects public rate limits, network-optional, never gates PR CI.

## 10. CI/CD & Publish Gate

`.github/workflows/ci.yml` (PR + push): `npm ci` → **`tsc --noEmit` over hand-written `src/`** (esbuild strips types unchecked — a type error in the SDK's own signatures would ship silently) → lint → **offline drift test** → `tsup` build → `@arethetypeswrong/cli --pack` → `npm pack` → install tarball into a throwaway fixture → `import`(ESM) + `require`(CJS) the bare specifier → assert `dependencies` empty → `npm pack --dry-run` asserts the tarball excludes `src`/`test`/`spec`.
`release.yml`: build + tag; publish **no-op** unless `PUBLISH_ENABLED` repo var set **and** `NPM_TOKEN` present (both absent until keys land). `spec-staleness.yml`: nightly + manual live-spec check (issue on drift, never gates).

## 11. Security
Zero runtime deps (no supply-chain surface beyond Node). `apiKey`/`beaconToken` only in headers, never logged, never in URLs; `.raw` error body capped + never includes request headers. No secrets in repo; live smoke reads key from env. Honest surfacing of `resolved_via`/`resolved_from`/`matched_on`/`note`.

## 12. Non-Functional Requirements
Zero runtime deps · dual ESM+CJS, `arethetypeswrong`-clean, no dual-package hazard · Node 18+ · committed generated types gated by offline drift · full mocked-HTTP test suite + optional rate-limit-respecting live smoke · deterministic, reproducible builds (exact pins + lockfile + LF).

## 13. Open Questions / Upstream Flags
**Resolved (jani, 2026-06-26):**
- ✅ **LICENSE = MIT** (§8). Publish stays `private:true` until keys land.
- ✅ **`artist('plain name')` = direct pass-through** (one hop, §3.2).
- ✅ **V1 scope = FULL public surface** — expands the PRD's FR1–FR9 (anon reads) to also cover the key-gated reads (`facets`, `master`, `masters`, `usage`, `wayfind.interpret`) and beacon endpoints (`searchEvents.*`). **Supersedes PRD §4 "Out of V1" and §6.** Every added endpoint is traced in §3's surface table to its spec path.

**Routed to the crate team (via jani) — SDK works regardless; these enable the honest version:**
1. **Beacon JWT issuance** (highest): how does the per-search beacon token + `search_event_id` reach a public consumer? `SearchResponse` exposes neither. SDK ships beacon methods requiring a caller-supplied `beaconToken`; auto-wiring blocked on this.
2. **`_links` runtime presence**: handoff claims `_links` on resolve + bandcamp bulk; spec declares none. SDK behavior unaffected (body-field-driven); confirm whether to file a spec-drift bug.
3. **Teaching-error fields**: confirm `message/hint/doc_url/next/param` are emitted at runtime (and consider declaring them in the `Error` schema). SDK reads them defensively regardless.
4. **No-param `/bandcamp` manifest** typed as `BandcampBulkPage` but returns a discovery manifest — spec mistype to fix.

## 14. Traceability
Every method → spec path (§3 table, verified per-op). Every design decision → `design-verify-synthesis.md` (29-agent adversarial, jq-grounded) → live `openapi.json`. Requirements → `prd.md` (FR1–FR9, anon surface) **+ the jani full-surface override (§13)** covering the 6 PRD-excluded endpoints (`facets`/`master`/`masters`/`usage`/`wayfind.interpret`/`searchEvents.*`) → handoff. **Anon classification basis**: an endpoint is anonymous iff it has no per-op `security` **and** the spec has no global `security` — both verified absent; a contract test asserts no global `security` object appears and the 5 key-gated + 2 beacon ops retain their per-op `security`, so an upstream auth-tier shift trips CI. Risks/must-fixes → §2–§10 mitigations + `grimoires/loa/a2a/flatline/sdd-substitute-review.json`.

## 15. Agent Ergonomics (ADX-1..10)

> A primary consumer of this SDK is AI agents (alongside human devs). The imported agent-ergonomics rubric + MCP/agent-API lens were adapted to a TS library and scored against this SDD (provenance: `grimoires/loa/agent-ergonomics-requirements.md`, workflow `wf_7af47989-2b7`). The SDD already nails the structural axioms — never-silent-fail (§7), the `kind` discriminant agents branch on (§7), honest provenance surfaced verbatim (§1/§3.1), fail-fast client-side validation (§3/§3.5). These 10 requirements close the success-and-recovery gaps. **MEDIUM thickness — no agent-mode fork, no telemetry, no reflection engine** (see rejected list in the artifact). Each is a sprint acceptance criterion.

| ID | Pri | Sprint | Requirement (testable) |
|----|-----|--------|------------------------|
| **ADX-1** | must | S3-surface | `resolve()`/`artist()` accept a **bare string**: `resolve('Four Tet')`→`?q=`, `resolve('discogs:123')`→discogs, URL→`?url=`, 64-hex→cluster; `resolve('')`→`CrateValidationError{code:'exactly_one_of'}`. Reuse §3.2 `HEX64`/`LOCATOR` regexes (single source). The most-guessed first call must work. |
| **ADX-2** | must | S2-errors | `CrateError.toJSON()` → stable `CrateErrorJSON` envelope `{name,kind,code?,message,status?,retryable?,retryAfter?,requestId?,param?,hint?,docUrl?,next?,details?}`; subclasses extend via `super.toJSON()`; **excludes `.raw` + raw `.cause`** (bounded handoff, no body/header leak). A plain `Error` serializes to `{}` — without this every teaching field evaporates when an agent logs the error. |
| **ADX-3** | must | S2-errors | Export the taxonomy: `CRATE_ERROR_KINDS` (const tuple) + `CrateErrorKind`; `CrateErrorCode \| (string & {})` + frozen `CRATE_ERROR_CODES` (server + client-minted codes); `CRATE_ERROR_REGISTRY` keyed by kind → `{retryable,clientSide,carries[],whenThrown}` generated from the §7 table. Typecheck test: `CrateErrorKind` == exact union of every class's `.kind`. |
| **ADX-4** | must | S2-errors | Client-side throws **author the fix**: `.hint`+`.next`(+`.param`) **required non-empty** (SDK wrote the message, it knows the fix). `.next` is a copy-pasteable corrected call. Defensive-read rule in §7 stays ONLY for server-sourced fields. Per-site codes: `api_key_required`/`exactly_one_of`/`beacon_token_required`/`masters_arity`/`base_url_has_path`/`node_fetch_missing`; locator-miss `CrateNotFoundError.hint`=resolve note, `.next`=`'use artistOrNull()'`. |
| **ADX-5** | must | S3-docs | JSDoc on every public method/constructor/option/guard: summary + `@param` + ≥1 `@example` + `@throws` (kinds) + `@see`. Forgiving methods show one `@example` per accepted input shape. Examples anon-safe. CI lint/AST gate fails on a missing `@example`/`@throws`. The `.d.ts` + hover docs are the agent's primary documentation. |
| **ADX-6** | must | S3-docs | README **"Using from an AI agent"** section: anon quickstart; error-recovery pattern (`switch(err.kind)`→`err.code`→`err.hint`/`err.next`, exported guards not `instanceof`, `JSON.stringify(err)` safe); `bulkAll()` pagination recipe; key-gated-vs-anon note; pointers to `crate.index()` + `CRATE_ERROR_REGISTRY`. CI doctest compiles the snippet under `tsc --noEmit`. |
| **ADX-7** | should | S3-surface | Self-description: export `VERSION` (tsup `define` build-stamp, not runtime require), frozen `CRATE_RESOURCES` (one entry/method `{method,endpoint,returns,auth,retryable,idempotent}` single-sourced from §3 table), re-export the error registries. `index()` JSDoc frames it as the live discovery entrypoint. (Static literals — no reflection engine; `Crate.describe()` optional.) |
| **ADX-8** | should | S3-surface | Resumable pagination: `.cursor` getter on the bulk handle + `CratePaginationError.lastCursor` re-passable to `bulk({cursor})`. Hitting `maxPages` ends iteration **cleanly** (`truncated:true`, no throw); only a non-advancing/cycling cursor throws `{code:'pagination_no_progress'}`, malformed page `{code:'pagination_malformed_page'}`. |
| **ADX-9** | should | S3-surface | Resolve §3.2/§13 "DX confirm pending": **decide+pin** `artist('Four Tet')` — direct `/artist/{name}`; document that a sparse/null identity means resolve(`{q}`) is the disambiguation path (backed by a live-smoke note). Bare numeric `artist('1234567')` → either `resolve({discogs})` or `CrateValidationError` whose `.next` names the `discogs:` form (pick + document in `@example`). |
| **ADX-10** | should | S3-tests | Public **API-surface snapshot** test: assert sorted public exports (runtime `Object.keys` + `.d.ts` names) + `CrateOptions`/`RequestOptions` key sets + `CRATE_ERROR_KINDS`/`CRATE_ERROR_CODES` + `CrateErrorJSON` envelope keys against a committed golden; any add/remove/rename is a reviewed diff with an actionable message. The library form of the capabilities-drift guard. |
