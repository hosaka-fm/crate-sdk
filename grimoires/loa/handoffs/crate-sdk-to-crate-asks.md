> ✅ **RESOLVED 2026-06-26** — crate responded: key-first wall (cycle-C → spec 1.1.0, this week); all P1 confirmed + batched into 1.1.0; _links real (cycle-072); beacons out; keyed tiers 49=60/min·10k/mo·concurrency 2, 99=300/min·50k/mo. Follow-up tracked as beads C2.1–C2.5. See NOTES.md Blockers.

# crate-sdk → crate — asks to put a user on the SDK ASAP

> Reverse handoff from `@hosaka/crate` (SDK) to `crate` (API). The SDK is built,
> tested, and validated live; PR #1 open; npm publish gated off. It consumes only
> the public `openapi.json` (info.version 1.0.0). Everything below is handled
> defensively today — these unblock SHIPPING a user and tighten correctness.
> Generated 2026-06-26.

## P0 — unblocks the FIRST user
1. **Anonymous surface + rate limits.** Confirm public+anonymous + stable: resolve,
   artist/{key}, bandcamp/{artistKey}, bandcamp (bulk), search, breakouts,
   tastemakers(+ones-to-watch), dossier/{grain}/{key}, /api/v1, wayfind/answer.
   Document the anon rate limit + that 429 returns Retry-After (delta or HTTP-date)
   + a RateLimited body. → lets a user use the SDK keyless now.
2. **API key model.** Confirm header `X-API-Key`, format `ck_(live|test)_<32-base62>`,
   how a user gets a key (free tier + paid tiers), and timeline. Gates the key-gated
   endpoints (facets, masters, usage, wayfind/interpret) AND our npm publish.

## P1 — low-effort spec fixes (typed correctness)
3. **Teaching-error fields.** `Error` schema only declares {error, details,
   retry_after_seconds, master_id}. Declare message/hint/doc_url/next/param if
   emitted at runtime, so our generated types carry them.
4. **/bandcamp manifest mistype.** No-param `GET /api/v1/bandcamp` returns a manifest
   but is typed `BandcampBulkPage`; give it its own response schema (fixes our
   `bandcamp.index()` typing).
5. **_links.** Absent from IdentityResolution + BandcampBulkPage though the handoff
   promised it. Emit + declare it, or confirm it's permanently out (we design around
   it via cluster_id/slug/next_cursor).
6. **Response headers in the contract.** Spec declares zero response headers; 429s
   only mention Retry-After + X-RateLimit-* in prose. Declare them (and X-Request-Id
   if emitted) on the relevant responses.

## P2 — only if you want these in the SDK
7. **Beacon telemetry** (search-events/observed|refined). Require a per-search
   BeaconBearerAuth JWT + search_event_id, but SearchResponse exposes neither, so a
   public consumer can't obtain them (we make the caller pass the token by hand).
   Return the token + search_event_id in the search response (body or header) +
   document the flow, or confirm beacons stay out for now.
8. **Spec stability.** We pin generated types behind a nightly drift check; bump
   info.version + note consumer-facing schema changes so we regenerate fast.

## What we need back
A yes/confirm or the change per item. Only **#1 (anon OK + rate limits)** and
**#2 (key model + publish green-light)** gate a first user.
