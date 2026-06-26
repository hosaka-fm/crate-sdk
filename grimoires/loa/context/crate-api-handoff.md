# crate-sdk — handoff from crate (the context seed for planning)

This is the knowledge transfer from the crate repo (which owns the API) into crate-sdk
(which owns the client). **crate-sdk depends ONLY on crate's PUBLIC contract** — the served
`openapi.json` + the generated types — never crate's internal source. Use this doc as the
seed for `/plan` → SDD → sprint-plan → flatline, then `/run` to implement.

## What crate-sdk is
`@hosaka/crate` — the official, typed TypeScript client for the crate public API (the hosaka
fleet's aggregation gateway: artist/master/label/festival dossiers + a Bandcamp data feed,
keyed on the fleet's canonical `cluster_id`). Think `stripe-node` / `@supabase/supabase-js`.

## Locked product decisions (jani, 2026-06-26)
1. **Name**: `@hosaka/crate` (the app is `@hosaka/crate-web`; this is the client consumers install).
2. **Repo**: its own repo (this one, `hosaka-fm/crate-sdk`, public) — Loa-mounted, own cycle.
3. **Publish**: npm **public**, versioned semver starting `0.1.0`, **published once crate's API keys land** (the client's auth handling depends on the key model). Build in-repo now.
4. **Thickness**: **Medium** (the Stripe/Supabase sweet spot) — typed methods + conveniences + auto-retry + pagination + typed errors + auth. **NO client-side cache** (crate's public reads are already CloudFront edge-cached; a client cache adds staleness — Stripe/Supabase don't cache either; caching is the consumer's choice via react-query/SWR).

## The contract crate-sdk builds on (PUBLIC, durable)
- **Spec**: `https://crate.0xhoneyjar.xyz/api/v1/openapi.json` (force-static, public, edge-cached).
- **Types**: generate with `npx openapi-typescript https://crate.0xhoneyjar.xyz/api/v1/openapi.json -o src/generated/crate-api.d.ts`. CI should regenerate + a drift test should gate it (mirror crate's `crate-api-types-contract.test.ts`). The SDK's public types should re-export the relevant `components['schemas']` (e.g. `ArtistDossierContract`, `IdentityResolution`, `ApiRootIndex`, `BandcampBulkPage`).
- **Discovery**: `GET /api/v1` returns a self-describing root index (`object:"api_index"`, a cold-start recipe, the full resource list with each surface's auth tier + how to get the key, and a `types.generate` command). The SDK can mirror this resource list but the openapi.json is the source of truth.

## The identity model (the heart of the API)
- `cluster_id` (pe-norm-v1 SHA-256 of the normalized artist name; 64-char hex) is the **canonical artist key**. Discogs/MBID are alternate locators + leaf coordinates; a consumer never needs to know about Discogs.
- **Two-tier honesty**: `resolved_via` = `'discogs'` (verified) vs `'cluster'` (observed); `resolved_from` = `'name'|'url'|'locator'`. The SDK should surface these honestly, not hide them.

## Endpoints the SDK wraps (all `/api/v1`)
| Method | Purpose | Notes |
|---|---|---|
| `GET /resolve?q=<name>` | name → cluster_id | the cold-start front door |
| `GET /resolve?url=<any link>` | paste a link → cluster_id | discogs/musicbrainz/bandcamp/soundcloud/instagram/website/spotify/youtube; returns `matched_on`; honest-gap (200 nulls) + `note` when unmappable |
| `GET /resolve?cluster=|discogs=|mbid=` | id → cluster_id + full locator set | |
| `GET /artist/{key}` | full artist dossier | key = 64-hex cluster_id (canonical) or slug |
| `GET /bandcamp` | bandcamp feed manifest (bare) / `?source=&cursor=&limit=` bulk | keyset pagination via `next_cursor` + `_links.next` |
| `GET /bandcamp/{artistKey}` | per-artist bandcamp feed | artistKey = cluster_id / `discogs:<id>` / `mbid:<uuid>` |
| `GET /dossier/{artist|master|label|festival}/{key}` | dossier grains | `/dossier/artist/{slug}` == `/artist/{slug}` |
| `GET /search?q=` | master-grain faceted search | |
| `GET /breakouts`, `/tastemakers`, `/tastemakers/ones-to-watch`, `/facets` | discovery | facets is sync-tier |
| `POST /wayfind/answer` | NL question → grounded answer | |

## Auth (carry an optional key)
- Today most data endpoints are public (anonymous). crate is **walling them behind API keys** (in progress) + free-tier keys for measured free access. The SDK constructor takes an **optional** `apiKey` and sends it as the `X-API-Key` header. It works against the public API today and the keyed API after — no SDK change needed when walling lands.
- Tiers: `sync` / `self_serve_49|99|299` / anonymous. Rate-limit + quota are server-side; the SDK should surface 429 (`Retry-After`) and auto-retry with backoff.

## Errors (teaching errors → typed exceptions)
crate returns `{ error, message, hint, doc_url, param?, next? }`. The SDK should throw a typed
`CrateError` exposing `.code` (the `error`), `.message`, `.hint`, `.docUrl`, `.next` (a ready
follow-up URL) so the developer sees *what to do next*, not just a status code.

## Hypermedia (`_links`)
`/resolve` and bandcamp bulk rows carry `_links` (`artist`, `bandcamp_feed`, `resolve`, `next`).
The SDK's convenience methods (e.g. `resolve().then(r => r.artist())`) can follow these.

## The Medium client surface (sketch — refine in the SDD)
```ts
import { Crate } from "@hosaka/crate";
const crate = new Crate({ apiKey });          // apiKey optional (public today)
const artist  = await crate.artist("Four Tet");     // name|cluster_id|slug → dossier (resolve→artist)
const r       = await crate.resolve({ url });        // any link/name/id → { cluster_id, locators, … }
const feed    = await crate.bandcamp(clusterId);     // per-artist bandcamp
for await (const row of crate.bandcamp.bulk("emergence")) { … }   // auto-paginate next_cursor
// retries 429/5xx with backoff; throws CrateError(code, hint, next); typed off the generated schema
```
Conveniences that earn their place: `crate.artist(nameOrId)` does resolve→artist in one call;
`resolve({ url | q | cluster | discogs | mbid })`; async-iterator pagination; typed errors; the
optional key. **Not** in V1: a response cache; an SDK for non-public/admin endpoints.

## Background / provenance (read for depth, don't depend on)
- The API DX arc (crate cycles 070–074): teaching errors + name front door, paste-a-link (`?url=`), root index + `_links`, generated types, and the lightning-fast indexed link resolver (`seen.artist_link_index`, carrefour#104).
- The cluster-first design: `crate roadmap/crate-api-v2-cluster-first.md`.
- The SDK is a **consumer** — if it can only see what the public spec exposes, it can't couple to crate's internals. Keep it that way.

## First moves in this repo
1. `/plan` (lean): a tight SDD + sprint-plan (skip a heavy PRD — requirements are above), flatline the SDD.
2. Set up the types-sync (openapi-typescript from the public spec) + drift test + CI (npm test/lint/typecheck; do NOT publish until keys land).
3. `/run` the sprint: implement the Medium client + tests (mock the HTTP layer; a small live smoke against the public API).
