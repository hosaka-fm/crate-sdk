# PRD — `@hosaka/crate` (the official crate TypeScript client SDK)

> **Lean PRD.** Requirements are fully specified in the crate→crate-sdk handoff and
> the published contract; per the agreed plan this PRD is a tight traceable anchor for
> the SDD + Flatline, not a 7-phase discovery.
> **Sources**: `grimoires/loa/context/crate-api-handoff.md` (handoff), the live spec
> `https://crate.0xhoneyjar.xyz/api/v1/openapi.json` (contract), user directive 2026-06-26.

---

## 1. Problem & Vision

The hosaka fleet's aggregation gateway (`crate`) exposes a rich public API — artist /
master / label / festival dossiers + a Bandcamp data feed, keyed on the fleet's
canonical `cluster_id`. Today any consumer integrating it must hand-roll fetch calls,
URL building, retries, pagination, and error handling against raw JSON.

`@hosaka/crate` is the **official, typed TypeScript client** for that public API —
`stripe-node` / `@supabase/supabase-js` for crate. It turns the contract into typed
methods with the conveniences a working developer expects, so integration is
"install, `new Crate()`, call a method" instead of "study the OpenAPI doc."

> From handoff:9-11: "`@hosaka/crate` — the official, typed TypeScript client for the crate public API ... Think `stripe-node` / `@supabase/supabase-js`."

**Why now**: crate's DX arc (cycles 070–074) shipped teaching errors, a name front door,
paste-a-link resolve, a self-describing root index, generated types, and a fast link
resolver. The API surface is stable and self-describing enough to wrap durably.

## 2. Goals & Success Metrics

| # | Goal | Success criterion |
|---|------|-------------------|
| G1 | Typed, contract-faithful client | All public types generated from the spec; consumer-facing schemas re-exported; **types-drift test gates CI** |
| G2 | Medium thickness DX | `crate.artist(name)` resolves→fetches in one call; `resolve({...})`, `bandcamp()`+`.bulk()` async-iterator, typed `CrateError`, auto-retry, optional key — all covered by tests |
| G3 | Zero-friction install | Dual ESM+CJS, **zero runtime deps** (Node 18+ global `fetch`), works in Node + modern bundlers |
| G4 | Honest by construction | Surfaces `resolved_via` / `resolved_from` / `matched_on` / honest-gap `note`; never hides nulls or fabricates `_links` |
| G5 | Release-ready, gated | CI green (typecheck + lint + test + drift); semver from `0.1.0`; **publish gated OFF until API keys land** |

> From handoff:13-17 (locked decisions), 20-21 (types + drift), 55-67 (surface + thickness).

## 3. Users & Stakeholders

- **Primary**: TypeScript/JavaScript developers (hosaka-fleet apps + public OSS consumers) integrating crate data. They want types, autocomplete, and not to think about transport.
- **Secondary**: `@hosaka/crate-web` and other fleet apps that may adopt the SDK.
- **Owner / decision-maker**: jani (locked the product decisions, handoff:13).
- **Upstream dependency**: the `crate` API team (owns the contract this SDK consumes).

## 4. Functional Requirements

Traceability: each FR cites the handoff and/or the spec path it derives from.

### P0 — core surface (must ship in V1)
- **FR1 — Construction**: `new Crate({ apiKey?, baseUrl? })`. `apiKey` optional, sent as `X-API-Key`. `baseUrl` defaults to `https://crate.0xhoneyjar.xyz`. (handoff:42-43, 57; spec `securitySchemes.ApiKeyAuth`)
- **FR2 — `crate.resolve({ url | q | cluster | discogs | mbid })`** → `IdentityResolution`. Exactly one identifier; surfaces `cluster_id`, `slug`, `locators`, `resolved_via`, `resolved_from`, `matched_on`, `note`. (handoff:30-34, 60; spec `GET /api/v1/resolve`)
- **FR3 — `crate.artist(nameOrIdOrSlug)`** → `ArtistDossierContract`. Convenience: if the input is not already a 64-hex cluster_id / slug, resolve→artist in one call (built from `cluster_id`/`slug`, **not** `_links`). (handoff:34, 59, 65; spec `GET /api/v1/artist/{key}`)
- **FR4 — `crate.bandcamp(artistKey)`** → `BandcampFeedContract` (per-artist feed). (handoff:36, 61; spec `GET /api/v1/bandcamp/{artistKey}`)
- **FR5 — `crate.bandcamp.bulk(source, { limit? })`** → async iterator over rows, auto-paginating on `next_cursor` until null. (handoff:35, 62; spec `GET /api/v1/bandcamp`, `BandcampBulkPage`)
- **FR6 — Auto-retry**: 429/500/503/504 retried with capped exponential backoff + jitter; respects `Retry-After` header, falls back to body `retry_after_seconds`. Configurable; safe (GET/idempotent only). (handoff:17,44; spec `RateLimited`, 429 description)
- **FR7 — Typed errors**: non-2xx → `throw CrateError` exposing `.code`, `.message`, `.status`, `.hint?`, `.docUrl?`, `.next?`, `.param?`, `.details?`, `.retryAfter?`. Reads teaching fields defensively (undeclared in spec, present at runtime). (handoff:46-49; spec `Error`)
- **FR8 — Re-exported types**: public package re-exports `ArtistDossierContract`, `IdentityResolution`, `ApiRootIndex`, `BandcampBulkPage` (+ `BandcampFeedContract`) from the generated module. (handoff:21)

### P1 — thin typed reads (include if they fall out of the shared transport cheaply; additive)
- **FR9** — `crate.index()` → `ApiRootIndex` (`GET /api/v1`); `crate.search(...)`, `crate.breakouts()`, `crate.tastemakers()` / `.onesToWatch()`, `crate.facets()`, `crate.dossier(grain, key)`, `crate.masters(id)`, `crate.wayfind(question)`. Typed off generated schemas, no bespoke logic. (handoff:37-40; spec paths)

### Out of V1
- Beacon-JWT endpoints (`/search-events/*`, `/wayfind/interpret` beacon flow), `/masters/batch`, `/usage` (need the beacon-JWT / key-quota model not yet landed); any client-side response cache; any non-public/admin endpoints. (handoff:44, 67)

## 5. Non-Functional Requirements
- **NFR1** — Zero runtime dependencies; rely on Node 18+ global `fetch`. (handoff:"no runtime deps beyond fetch")
- **NFR2** — Dual ESM + CJS output with correct `exports` map and emitted `.d.ts`; no dual-package hazard.
- **NFR3** — Types generated from the spec and **committed**; offline drift test asserts committed types == regenerated; CI gates it. (handoff:20-21)
- **NFR4** — Tests against a mocked HTTP layer covering retries, pagination, error mapping, and the resolve→artist convenience; one optional live smoke that **respects public rate limits**. (handoff:"Tests")
- **NFR5** — No secrets in the repo; smoke test reads any key from env only.
- **NFR6** — Honest/additive surface: never drop `resolved_via`/`resolved_from`/`matched_on`/`note`; opaque Bandcamp rows surfaced verbatim.

## 6. Scope & Prioritization
- **V1 (this cycle)**: P0 FR1–FR8 + build + types-drift + CI + tests, publish gated OFF. P1 FR9 included if low-cost.
- **Future**: publish-on-keys; beacon/JWT flows; usage/quota surfacing; richer pagination helpers if demanded.

## 7. Risks & Dependencies
| Risk / Dependency | Impact | Mitigation |
|---|---|---|
| API keys not yet landed | Can't publish; auth model may shift | Optional key now (works public + keyed); publish gated behind CI flag |
| Contract gaps: `Error` teaching fields, `_links`, `next_cursor` undocumented vs handoff | Brittle if we depend on undocumented shapes | Build on documented fields; read teaching fields defensively; drift test catches contract changes |
| Live-spec drift (crate evolves) | Generated types stale | Offline drift gate + scheduled live-spec staleness check |
| Cross-model dissenter flaky fleet-wide | Weaker adversarial review | Compensate with an in-harness adversarial design-verify workflow before coding |

## 8. Locked Decisions (do not re-open — jani, 2026-06-26)
1. Package `@hosaka/crate`; public npm; semver from `0.1.0`; **do not publish until crate's API keys land** (build + tag in-repo only).
2. Thickness **Medium**: typed methods + conveniences + auto-retry (429/5xx, backoff, Retry-After) + async-iterator pagination + teaching-errors-as-typed-exceptions + optional `apiKey` (`X-API-Key`). **No client-side cache.**
3. SDK is a **consumer of the PUBLIC API only** — build on `openapi.json`, never couple to crate internals.
