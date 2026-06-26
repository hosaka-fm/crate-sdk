# Agent Working Memory (NOTES.md)

> This file persists agent context across sessions and compaction cycles.
> Updated automatically by agents. Manual edits are preserved.

## Active Sub-Goals
<!-- Current objectives being pursued -->
- Build `@hosaka/crate` — official typed TS client SDK for crate's PUBLIC API.
- Lean path: lean PRD → adversarial design-verify (workflow) → SDD → Flatline → sprint-plan → /run (implement→review→audit).
- Publish gated OFF until crate API keys land (build + tag in-repo only).

## Discovered Technical Debt
<!-- Issues found during implementation that need future attention -->

## Blockers & Dependencies
<!-- External factors affecting progress -->
- [ ] [DEPENDENCY] npm publish blocked until crate's API key model lands (locked decision §3). Build/test/tag only.
- [ ] [FLAG-UPSTREAM] `_links` hypermedia (handoff:51-53) is absent from `IdentityResolution` + `BandcampBulkPage` in the live spec. Designing around it (body fields). Confirm with crate team whether intended.
- [ ] [FLAG-UPSTREAM] Teaching-error fields (`message/hint/doc_url/next/param`, handoff:46-49) not declared in `Error` schema. Reading defensively. Confirm runtime presence / consider documenting.
- [ ] [FLAG-UPSTREAM] Beacon issuance gap: `search-events/*` need a `BeaconBearerAuth` JWT + `search_event_id`, but `SearchResponse` exposes neither (no token/event-id field, no 200 response headers). SDK can't auto-wire the beacon flow from the public contract → beacon methods require caller-supplied token. Confirm how the per-search JWT is meant to reach a public consumer.

## Contract Grounding (live spec, fetched 2026-06-26)
> Source of truth: `https://crate.0xhoneyjar.xyz/api/v1/openapi.json` (OpenAPI 3.1, info.version 1.0.0, server `https://crate.0xhoneyjar.xyz`). Snapshot in scratchpad; vendor into repo during /implement.

**Auth**: `securitySchemes.ApiKeyAuth` = header `X-API-Key`, key format `ck_(live|test)_<32-base62>`. Global + per-op `security: null` today (public/anonymous). SDK sends `X-API-Key` only when `apiKey` provided. Beacon endpoints use a separate per-search `Authorization: Bearer <JWT>` (out of V1 scope).

**SDK-wrapped endpoints** (all under `/api/v1`):
- `GET /resolve?url=|q=|cluster=|discogs=|mbid=` → `IdentityResolution`
- `GET /artist/{key}` (key = 64-hex cluster_id OR slug, 1–200 chars) → `ArtistDossierContract`
- `GET /bandcamp/{artistKey}` (cluster_id / `discogs:<id>` / `mbid:<uuid>`, 1–80 chars) → `BandcampFeedContract`
- `GET /bandcamp` (no params = index page; `?source=&cursor=&limit=` = bulk) → `BandcampBulkPage`
- Other public reads (P1, thin typed): `GET /api/v1` (`ApiRootIndex`), `/search`, `/breakouts`, `/tastemakers`, `/tastemakers/ones-to-watch`, `/facets`, `/dossier/{master|artist|label|festival}/{key}`, `/masters/{id}`, `POST /wayfind/answer`.
- Out of V1: beacon JWT endpoints (`/search-events/*`, `/wayfind/interpret` beacon), `/masters/batch`, `/usage` (needs key/quota model).

**Contract-vs-handoff gaps (design honestly around these):**
1. `Error` schema = `{ error(req), details[], retry_after_seconds, master_id }` — does NOT declare the handoff's `message/hint/doc_url/next/param` teaching fields. Per API owner they exist at runtime; spec `type:object` is open. → `CrateError` reads documented + teaching fields DEFENSIVELY (optional, graceful when absent).
2. `IdentityResolution` has NO `_links`. → `resolve→artist` convenience built from `cluster_id`/`slug`, not hypermedia.
3. `BandcampBulkPage` has `next_cursor` (nullable) but NO `_links.next`. → pagination keys off `next_cursor`; stop when null. `rows` = `Record<string, unknown>[]` (verbatim, opaque — surface as-is).
4. `429` response = `RateLimited { error:'rate_limited', retry_after_seconds(req) }`; description confirms `Retry-After` + `X-RateLimit-*` headers present. → retry reads `Retry-After` header, falls back to body `retry_after_seconds`. Retryable statuses: 429, 500, 503, 504.

**Type-gen validated**: `npx openapi-typescript@7.13.0 openapi.json -o crate-api.d.ts` → clean, 2619 lines, emits `paths` + `components["schemas"][...]`; all re-export targets (`ArtistDossierContract`, `IdentityResolution`, `ApiRootIndex`, `BandcampBulkPage`, `BandcampFeedContract`) present. `operations` is empty (spec has no operationIds — key off `paths`/`components`).

**Toolchain**: Node v22.22.2, npm 10.9.7, br 0.2.6.

## Session Continuity
<!-- Key context to restore on next session -->
| Timestamp | Agent | Summary |
|-----------|-------|---------|
| 2026-06-26 | claude | Grounded on handoff + live openapi.json. Mapped endpoints, auth, error/pagination shapes; logged 4 contract-vs-handoff gaps. Validated openapi-typescript. Next: lean PRD → design-verify workflow → SDD. |
| 2026-06-26 | claude | DONE: lean PRD, 29-agent design-verify (synthesis saved), SDD (full surface, all adversarial fixes), Flatline (degraded→substitute gate APPROVED_WITH_FIXES, fixes integrated). Pending crate-team: beacon JWT issuance, _links, teaching-error fields, /bandcamp manifest mistype. NEXT: /sprint-plan → /run (implement→review→audit). Publish gated OFF. |
| 2026-06-26 | sprint-planner | DONE: created ledger.json (cycle-001) + sprint.md. 3 dependency-ordered sprints mapped to SDD module order: S1 Foundation (types/drift/build/CI, MEDIUM 6t), S2 Transport core (retry/errors/http, MEDIUM 6t), S3 Public surface + E2E (client/conveniences/resources/types/tests, LARGE 9t). All G1-G5 mapped to tasks; Task 3.E2E validates all goals. Beads DEGRADED (not init'd) — proceeded; create beads from sprint.md before /run. NEXT: /run sprint-plan (or /build). |
| 2026-06-26 | claude | Agent-DX review folded in (sdd §15 + sprint S2/S3, ADX-1..10). Beads init'd (HEALTHY). On branch feat/crate-sdk-v1-cycle-001. **S1 DONE + committed (ac6a45d)**: all 7 ACs green (zero-dep, drift byte-identical, dual ESM+CJS, attw all-green, lint, pack-clean). attw pinned 0.18.4 (0.17.4 buggy). NEXT: S2 transport (retry/errors+ADX-2/3/4/http + tests), then S3. |

## Decision Log
<!-- Major decisions with rationale -->
| Date | Decision | Rationale | Source |
|------|----------|-----------|--------|
| 2026-06-26 | Skip heavy 7-phase PRD; write lean traceable PRD anchor | Requirements fully specified in handoff + locked decisions; user directive "skip the heavy PRD" | crate-api-handoff.md:75, user prompt |
| 2026-06-26 | Pagination + resolve conveniences use documented fields (`next_cursor`, `cluster_id`/`slug`), not undocumented `_links` | Build only on the public contract; `_links` not in published schemas | openapi.json schemas |
| 2026-06-26 | `CrateError` reads teaching fields (hint/docUrl/next/param) defensively | Spec `Error` schema under-declares them but API owner confirms runtime presence | openapi.json Error vs handoff:46-49 |
| 2026-06-26 | API is NOT uniformly anonymous — error model handles 401/402/404/413 from V1 | Verified per-op `ApiKeyAuth` on masters/{id},masters/batch,facets,usage,wayfind/interpret; `BeaconBearerAuth` on search-events/*; wayfind/answer anon-but-402 | openapi.json per-op security (adversarial synth, verified) |
| 2026-06-26 | V1 = FULL public surface (jani via AskUserQuestion) | User chose full coverage: conveniences + anon reads + key-gated reads + beacon endpoints. Error model universal; beacon methods take caller-supplied bearer token; key-gated 401/402 surfaced when keyless | user answer |
| 2026-06-26 | Design-verify workflow had a `.then`-on-array bug → verify phase failed first run; fixed + resumed (designs cached) | Genuine adversarial verdicts needed (user: compensate for flaky cross-model dissenter) | wf_176bccea-8a7 |
| 2026-06-26 | License = **MIT** (jani); publish stays private:true until keys | Adversarial verify flagged spec `info.license="Commercial"`, but official clients of paid APIs are conventionally MIT (stripe-node, supabase-js); jani confirmed MIT. Spec license describes the API, not the client | jani via AskUserQuestion |
| 2026-06-26 | `artist('plain name')` = direct pass-through (one hop) | Endpoint name-resolves natively; dossier carries resolved_via; fewer round-trips | jani via AskUserQuestion |
| 2026-06-26 | Error guards brand-based (`Symbol.for`) not raw `instanceof`; per-class `this.name` string literals | Dual ESM+CJS build → two CrateError classes → instanceof breaks; minifiers mangle `new.target.name` | design-verify-synthesis.md |
| 2026-06-26 | Full synthesis saved to grimoires/loa/design-verify-synthesis.md | Locked design input for SDD/Flatline/sprint; survives compaction | wf_176bccea-8a7 |
| 2026-06-26 | Flatline degraded (both voices chain-exhausted, 0 findings) → NOT treated as pass; ran in-harness SDD-review substitute gate | Loa rule: degraded verdict ≠ clean. User pre-authorized workflow compensation for flaky cross-model dissenter | flatline-orchestrator + wf_83912243-5fa |
| 2026-06-26 | SDD-review verdict APPROVED_WITH_FIXES (0 blocker, 2 HIGH, 4 MED) — all integrated into sdd.md | Caught real defects: undefined CrateError.kind discriminant (now full error-class table §7); dropped SearchParams (now §3.5, 8 facets string\|string[]); retry-config keys exposed §3; request-type re-exports §2; MIT shippable disclosure §8; masters() arity guard | grimoires/loa/a2a/flatline/sdd-substitute-review.json |
