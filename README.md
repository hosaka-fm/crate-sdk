<div align="center">

# @hosaka-fm/crate

**The official, typed TypeScript client for the [crate](https://crate.hosaka.fm) public API** —
a **cluster-first** music-catalogue gateway: artist / label / festival dossiers keyed on the
canonical `cluster_id`, with release/master detail and Bandcamp standing carried as dimensions of
the artist dossier.

[![npm version](https://img.shields.io/npm/v/@hosaka-fm/crate.svg)](https://www.npmjs.com/package/@hosaka-fm/crate)
[![CI](https://github.com/hosaka-fm/crate-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/hosaka-fm/crate-sdk/actions/workflows/ci.yml)
[![types included](https://img.shields.io/badge/types-included-blue.svg)](https://github.com/hosaka-fm/crate-sdk)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://github.com/hosaka-fm/crate-sdk/blob/main/package.json)
[![minzipped size](https://img.shields.io/bundlephobia/minzip/@hosaka-fm/crate.svg)](https://bundlephobia.com/package/@hosaka-fm/crate)
[![Node 18+](https://img.shields.io/badge/node-%E2%89%A518-339933.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)

</div>

Think `stripe-node` / `@supabase/supabase-js`: **typed methods, automatic retries, default-rich
one-round-trip dossiers, and teaching errors** over crate's public contract. Built so a human
reaches a green result in 60 seconds — and so an **AI agent succeeds first-try and recovers from
failures using the error object alone**.

```ts
import { Crate } from '@hosaka-fm/crate';

const crate = new Crate({ apiKey: process.env.CRATE_API_KEY });

const artist = await crate.artist('Four Tet'); // name | slug | cluster_id | discogs:/mbid: → dossier
```

- 🧭 **Typed end to end.** Every parameter and response is generated from crate's live OpenAPI
  spec (v2, 2.0.0) — full autocomplete, no `any`, no hand-written drift.
- 🪪 **Cluster-first.** `resolve()` collapses any reference to a canonical `cluster_id`; everything
  else keys off it. Release/master detail and Bandcamp standing are **dimensions of the artist
  dossier**, not separate calls.
- 🔁 **Resilient by default.** Auto-retry on `429/5xx` with full-jitter backoff that honours
  `Retry-After`; per-attempt timeouts and a whole-call deadline. The SDK already retried — you don't.
- 📑 **Default-rich.** `artist()` returns the full dossier in one round-trip; `?fields=` only
  _trims_ — never a forced second call for the obvious thing.
- 🧯 **Errors that teach.** Typed exceptions carry `.kind` / `.code`, a human `.hint`, and a
  copy-pasteable `.next` — and they're `JSON.stringify`-safe for logging and agent handoff.
- 🤖 **Agent-native.** Forgiving inputs, branch-on-code error handling, and a runtime-discoverable
  surface (`crate.index()`, `CRATE_RESOURCES`, `CRATE_ERROR_REGISTRY`). See [Using from an AI agent](#using-from-an-ai-agent).
- 📦 **Lean.** Dual ESM + CJS, **zero runtime dependencies**, tree-shakeable, types bundled.

> **License & access.** The MIT license (see [`LICENSE`](./LICENSE)) covers _this client
> library's source_. Access to the crate API is governed separately by crate's Terms of Service
> and requires a valid API key; MIT grants no right to use the crate service itself. See
> [`NOTICE`](./NOTICE).

> **Status — `v1.0.0`, targeting crate `/api/v2`.** This is the first stable major, cut against
> crate's cluster-first v2 (2.0.0). crate is **key-first**: every data endpoint requires an
> `apiKey` (sent as `X-API-Key`); only `crate.index()` is keyless. **Upgrading from 0.x?** v2
> drops `master`/`masters`, the standalone `bandcamp.*`, `wayfind.*`, and `usage()` — see
> [Migrating from v1 (0.x)](#migrating-from-v1-0x).

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Authentication](#authentication)
- [Mental model](#mental-model)
- [Recipes](#recipes)
- [Using from an AI agent](#using-from-an-ai-agent)
- [Client surface](#client-surface)
- [Errors](#errors)
- [Configuration & retries](#configuration--retries)
- [TypeScript](#typescript)
- [Compatibility](#compatibility)
- [Migrating from v1 (0.x)](#migrating-from-v1-0x)
- [Versioning & stability](#versioning--stability)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Contributing, security, license](#contributing-security-license)

## Install

```sh
npm install @hosaka-fm/crate
pnpm add @hosaka-fm/crate
yarn add @hosaka-fm/crate
bun add @hosaka-fm/crate
```

Requires **Node 18+** (uses the global `fetch`). Ships dual ESM + CJS with **zero runtime
dependencies** and bundled types (no `@types/...` needed).

## Quick start

```ts
import { Crate } from '@hosaka-fm/crate';

// crate is key-first — every data endpoint needs a key (only crate.index() is keyless).
const crate = new Crate({ apiKey: process.env.CRATE_API_KEY });

// 1. Full artist dossier from a name (or slug, cluster_id, or discogs:/mbid: locator).
const artist = await crate.artist('Four Tet');
console.log(artist.display, '→', artist.resolved_via); // "Four Tet" → "discogs"

// 2. Resolve any link / name / id to a canonical identity.
const id = await crate.resolve('https://fourtet.bandcamp.com');
console.log(id.cluster_id, id.locators.bandcamp);

// 3. A label dossier (cluster-first), and a trimmed artist dossier via ?fields=.
const label = await crate.label('warp-records');
const slim = await crate.artist('Four Tet', { fields: ['discography'] });
```

That's the whole loop: **construct once, call methods, await typed results.**

## Authentication

crate has three auth tiers; the SDK enforces them locally so you fail fast, never with a
confusing runtime `401`:

| Tier           | How                                   | Covers                                     |
| -------------- | ------------------------------------- | ------------------------------------------ |
| **Anonymous**  | nothing                               | only `crate.index()`                       |
| **API key**    | `new Crate({ apiKey })` → `X-API-Key` | every data endpoint                        |
| **Beacon JWT** | `{ beaconToken }` per call            | `crate.searchEvents.observed` / `.refined` |

```ts
const crate = new Crate({ apiKey: process.env.CRATE_API_KEY });
```

Every data method throws `CrateValidationError('api_key_required')` **before any network call**
if constructed without an `apiKey` — a fail-fast guard, not a wasted round-trip. Keep keys in an
env var (`CRATE_API_KEY`); never hard-code or commit them. Keys are invite-only today — see the
[crate docs](https://crate.hosaka.fm/docs). Full detail: [docs/authentication.md](./docs/authentication.md).

## Mental model

There is **one object**. Construct it once, and every capability hangs off it:

```ts
const crate = new Crate({ apiKey });

crate.resolve(query); // any link/name/id → a canonical cluster_id (the front door)
crate.artist(key); // the full artist dossier (+ artistOrNull; + { fields } to trim)
crate.label(key); // the full label dossier (cluster-first)
crate.search(params); // faceted catalogue search · crate.facets() · crate.breakouts()
crate.tastemakers(); // callable + .onesToWatch()
crate.dossier.{ artist, label, festival, manifest }(slug); // per-grain dossiers (slug aliases)
crate.searchEvents.observed(body, { beaconToken }); // + .refined() — relevance beacons
crate.index(); // the keyless, self-describing root (resources + recipes + error catalogue)
```

**Cluster-first:** in v2 there are no standalone `master` / `bandcamp` calls — release/master
detail rides on `artist().discography` and Bandcamp standing on `artist().bandcamp_emergence` /
`bandcamp_tastemaker`. Every example below starts from a constructed `crate`.

## Recipes

Copy-paste-runnable. Each is a single capability; see [docs/recipes.md](./docs/recipes.md) for more.

```ts
// Resolve any identifier (URL, name, 64-hex cluster_id, or discogs:/mbid: locator).
const id = await crate.resolve('Four Tet');

// Artist dossier — throw on an unresolved locator, or get null with artistOrNull().
const a = await crate.artist('discogs:1234');
const maybe = await crate.artistOrNull('discogs:999999'); // → null if unresolved

// Trim the dossier to just the facets you need (default = the full dossier, one round-trip).
const slim = await crate.artist('Four Tet', { fields: ['discography', 'bandcamp_emergence'] });

// A label dossier (cluster-first).
const label = await crate.label('warp-records');

// Faceted search + breakouts.
const hits = await crate.search({ genre: ['idm', 'ambient'], year_from: 2000, limit: 20 });
const breaking = await crate.breakouts();

// Cancel an in-flight call with an AbortSignal.
const ac = new AbortController();
const p = crate.search({ q: 'jungle' }, { signal: ac.signal });
ac.abort(); // → rejects with CrateAbortError (never retried)
```

## Using from an AI agent

The SDK is built so an agent succeeds first-try and recovers from failures **using the error
object alone** — no external docs, no message parsing.

- **Forgiving inputs.** `resolve(...)` / `artist(...)` accept a bare string (a URL, a
  `discogs:`/`mbid:` locator, a 64-hex `cluster_id`, or a free-text name) or an explicit object.
- **Branch on `err.kind` / `err.code`**, never on the message. Every client-side error carries
  `err.hint` (what's wrong) and `err.next` (a copy-pasteable corrected call).
- **Errors are JSON-safe.** `JSON.stringify(err)` preserves the teaching payload for logs and
  agent-to-agent handoff (a plain `Error` serializes to `{}`).
- **Default-rich, then trim.** `artist()` returns the full dossier; pass `{ fields }` only to trim
  — never a forced second call. An unknown field returns a teaching `400 invalid_fields`.
- **Don't double-retry.** The SDK already retries `429/5xx` with backoff. On a `429`, read
  `err.retryAfter` / `err.rateLimit`.
- **Prefer the `isCrate*` guards over `instanceof`** (they survive the ESM/CJS boundary).
- **Discover at runtime.** `crate.index()` (live root + cold-start recipe + recipes + error
  catalogue), `CRATE_RESOURCES` (static surface map), `CRATE_ERROR_REGISTRY` (error dictionary).

```ts
import { Crate, isCrateError, isRateLimited } from '@hosaka-fm/crate';

const crate = new Crate({ apiKey: process.env.CRATE_API_KEY });

try {
  const artist = await crate.artist('Four Tet', { fields: ['discography'] });
  handle(artist.discography);
} catch (err) {
  if (!isCrateError(err)) throw err; // not ours — rethrow
  switch (err.kind) {
    case 'validation':
      console.error(`${err.code}: ${err.hint} → ${err.next}`); // the SDK tells you the fix
      break;
    case 'api': // narrowed to CrateAPIError
      console.error(`HTTP ${err.status} (${err.code}) req=${err.requestId}`);
      if (isRateLimited(err)) await wait(err.retryAfter); // SDK already backed off — this is your ceiling
      break;
    default:
      console.error(JSON.stringify(err)); // JSON-safe teaching payload for handoff
  }
}
```

> This recipe is mirrored by [`examples/agent.ts`](./examples/agent.ts), which is type-checked in
> CI so it can't rot. There's also a machine-first [`AGENTS.md`](./AGENTS.md) and an
> [`llms.txt`](./llms.txt) index. Full guide: [docs/ai-agents.md](./docs/ai-agents.md).

## Client surface

One row per public method (mirrors `CRATE_RESOURCES`). `Auth`: **key** = `X-API-Key`, **anon** =
keyless, **beacon** = per-search JWT. All read methods auto-retry on a retryable status.

<!-- BEGIN GENERATED:surface (npm run docs:gen) -->

| Call                                     | Endpoint                                   | Auth    | Returns                         |
| ---------------------------------------- | ------------------------------------------ | ------- | ------------------------------- |
| `crate.resolve(query)`                   | `GET /api/v2/resolve`                      | **key** | `IdentityResolution`            |
| `crate.artist(key)`                      | `GET /api/v2/artist/{key}`                 | **key** | `ArtistDossierContract`         |
| `crate.artistBandcampRelease(key, item)` | `GET /api/v2/artist/{key}/bandcamp/{item}` | **key** | `ArtistBandcampReleaseResponse` |
| `crate.artistOrNull(key)`                | `GET /api/v2/artist/{key}`                 | **key** | `ArtistDossierContract \| null` |
| `crate.label(key)`                       | `GET /api/v2/label/{key}`                  | **key** | `LabelDossierContract`          |
| `crate.search(params)`                   | `GET /api/v2/search`                       | **key** | `SearchResponse`                |
| `crate.breakouts()`                      | `GET /api/v2/breakouts`                    | **key** | `BreakoutsResponse`             |
| `crate.index()`                          | `GET /api/v2`                              | anon    | `ApiRootIndex`                  |
| `crate.facets()`                         | `GET /api/v2/facets`                       | **key** | `FacetCounts`                   |
| `crate.dossier.artist(slug)`             | `GET /api/v2/dossier/artist/{slug}`        | **key** | `ArtistDossierContract`         |
| `crate.dossier.label(slug)`              | `GET /api/v2/dossier/label/{slug}`         | **key** | `LabelDossierContract`          |
| `crate.dossier.festival(slug)`           | `GET /api/v2/dossier/festival/{slug}`      | **key** | `FestivalDossierContract`       |
| `crate.dossier.manifest()`               | `GET /api/v2/dossier/manifest`             | **key** | `DossierManifest`               |
| `crate.tastemakers()`                    | `GET /api/v2/tastemakers`                  | **key** | `TastemakersResponse`           |
| `crate.tastemakers.onesToWatch()`        | `GET /api/v2/tastemakers/ones-to-watch`    | **key** | `OnesToWatchResponse`           |
| `crate.aura(params)`                     | `GET /api/v2/aura`                         | **key** | `AuraIndexResponse`             |
| `crate.aura.artist(clusterId)`           | `GET /api/v2/aura/{cluster}`               | **key** | `AuraArtistResponse`            |
| `crate.searchEvents.observed(body)`      | `POST /api/v2/search-events/observed`      | beacon  | `void`                          |
| `crate.searchEvents.refined(body)`       | `POST /api/v2/search-events/refined`       | beacon  | `void`                          |

<!-- END GENERATED:surface -->

### Cluster-first dimensions & honest gaps

In v2 the catalogue is keyed on the artist (the `cluster_id`); records and Bandcamp **attach** to
it rather than being top-level resources. So instead of `master()` / `bandcamp.release()`, you read
the artist dossier and look at its dimensions (trim with `?fields=`):

- **`discography`** — the artist's catalogue index: per-master `{ discogsMasterId, representativeName, isPrimary, billingPosition }`. It's an _index_, not the per-master signal layer; `_links.master` points at the (frozen) v1 surface.
- **`bandcamp_emergence` / `bandcamp_tastemaker`** — artist-level Bandcamp standing (emergence class, demand, supporter cohort). Per-release Bandcamp tracklists **are back in v2** (1.2.0, cluster-attached): list them from the dossier's `bandcamp_releases` facet, then fetch the full release with `artistBandcampRelease(key, item)` — tracklist with `duration_s`, artwork with `width`/`height`, label, tags, economics.

`null` (HTTP 200 with `cluster_id: null` / `present: false`) is an **honest gap**, not an error —
`artistOrNull()` returns it. `cluster_id` is an **opaque string**; pass it through, never numericize.
Artwork (`ArtworkItem[]`) is **link-only** (`rehost: false`).

## Errors

Every failure throws a `CrateError` subclass with a `kind` discriminant and a machine-branchable `code`:

| `kind`                                              | class                                                         | retryable                      | notes                                                        |
| --------------------------------------------------- | ------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------ |
| `api`                                               | `CrateAPIError`                                               | iff 429/500/503/504            | `.status`, `.retryAfter`, `.rateLimit`, `.requestId`, `.raw` |
| `network` / `timeout` / `abort`                     | `CrateNetworkError` / `CrateTimeoutError` / `CrateAbortError` | net & timeout: yes · abort: no | transport failures                                           |
| `validation` / `not_found` / `parse` / `pagination` | `Crate{Validation,NotFound,Parse,Pagination}Error`            | no                             | client-side; carry `hint` + `next`                           |

HTTP status maps to `kind` predictably: `401 → validation` (`api_key_required`), `404 →
not_found`, `429 → api` (`isRateLimited`), `5xx → api` (retryable), transport faults `→
network`/`timeout`. A `400 invalid_fields` (from `?fields=`) is a `CrateAPIError` carrying the
valid set in `.hint` + a corrected call in `.next`. Always log `err.requestId` when contacting support.

```ts
import { CRATE_ERROR_REGISTRY } from '@hosaka-fm/crate';
CRATE_ERROR_REGISTRY.api; // → { retryable: true, clientSide: false, carries: ['status','retryAfter',…], whenThrown: '…' }
```

Branch on `CRATE_ERROR_KINDS` / `CRATE_ERROR_CODES` (both exported). Full reference:
[docs/errors.md](./docs/errors.md).

## Configuration & retries

```ts
const crate = new Crate({
  apiKey: process.env.CRATE_API_KEY,
  timeout: 30_000, // per-attempt, ms
  maxRetries: 2, // retries (not total sends); 0 disables
  totalDeadlineMs: 120_000, // whole-call budget across retries; null disables
});
```

| Option            | Default                   | Meaning                                                     |
| ----------------- | ------------------------- | ----------------------------------------------------------- |
| `apiKey`          | —                         | customer key → `X-API-Key` (required for data endpoints)    |
| `baseUrl`         | `https://crate.hosaka.fm` | API origin (no path)                                        |
| `fetch`           | global `fetch`            | injectable `fetch` (tests / custom agents / older runtimes) |
| `timeout`         | `30000`                   | per-attempt timeout, ms                                     |
| `maxRetries`      | `2`                       | retries, not total sends; `0` disables                      |
| `maxBackoffMs`    | `8000`                    | full-jitter backoff cap, ms                                 |
| `maxRetryAfterMs` | `60000`                   | clamp on a server-directed `Retry-After`, ms                |
| `totalDeadlineMs` | `120000`                  | whole-call budget across retries, ms (`null` to disable)    |
| `headers`         | —                         | extra default headers (merged under SDK-managed ones)       |

Every knob is overridable per call via `RequestOptions` (plus `signal: AbortSignal` and the
`fields` trim). **Reliability model:** retries fire only on `429/500/503/504`, use full-jitter
backoff, honour `Retry-After` (clamped by `maxRetryAfterMs`), and stop at `totalDeadlineMs`. All
read methods are idempotent/safe. A caller `abort()` raises `CrateAbortError` (never retried); a
deadline raises `CrateTimeoutError` (retried). If crate ever marks a route deprecated, the SDK
warns once on the `Sunset` header and follows a `308` preserving method + body. More:
[docs/configuration.md](./docs/configuration.md).

## TypeScript

```ts
import { Crate, isCrateError, type ArtistDossierContract } from '@hosaka-fm/crate';
```

- **Generated types.** Params and responses are typed straight off crate's `/api/v2` OpenAPI spec
  (regenerate with `npm run generate`). No `any` on the public surface.
- **Result narrowing.** `artist()` throws on an unresolved locator; `artistOrNull()` returns
  `ArtistDossierContract | null`. `switch (err.kind)` narrows the error union (`case 'api'` →
  `CrateAPIError`, with `.status` etc.).
- **Guards over `instanceof`.** `isCrate*` guards both narrow the union **and** survive the
  ESM/CJS dual-package boundary (where `instanceof` sees two distinct classes).
- **Dual-package correctness** is verified by [`@arethetypeswrong/cli`](https://github.com/arethetypeswrong/arethetypeswrong.github.io)
  in CI (`npm run check:exports`). Requires **TypeScript 5.0+**.

## Compatibility

| Runtime                   | Supported                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Node.js                   | **18+** (non-EOL LTS lines)                                                                                 |
| Deno / Bun                | ✅ (global `fetch`)                                                                                         |
| Cloudflare Workers / Edge | ✅ (server-side; never ship a key to a browser)                                                             |
| Browsers                  | ⚠️ technically (global `fetch`) but **server-side only** by default — a browser bundle exposes your API key |
| TypeScript                | **5.0+** (`node16`/`nodenext` or `bundler` moduleResolution)                                                |

Older or non-standard runtimes: pass your own `fetch` via the `fetch` option. Dual ESM + CJS,
`sideEffects: false` (tree-shakeable), zero runtime deps, types bundled.

## Migrating from v1 (0.x)

`1.0.0` targets crate's cluster-first `/api/v2` — a deliberate breaking change from `0.3.x`
(which targeted `/api/v1`, now frozen). Most of the surface is unchanged; the demotions:

| Removed in 1.0                         | Where the data went / what to do                                                                                                                                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crate.master(id)` / `crate.masters()` | **Removed capability.** The per-master signal layer has no v2 endpoint. The artist's catalogue index is `artist().discography`.                                                                                                                                        |
| `crate.dossier.master(id)`             | **Removed.** No v2 master dossier.                                                                                                                                                                                                                                     |
| `crate.bandcamp.*` (release/bulk/…)    | Artist-level standing is `artist().bandcamp_emergence` / `bandcamp_tastemaker`. Per-release detail is cluster-attached: `artistBandcampRelease(key, item)` (tracklist + durations + artwork dims + economics); list items via the dossier's `bandcamp_releases` facet. |
| `crate.wayfind(…)` / `.interpret(…)`   | **Removed** — natural-language surfaces stay v1-only this cut.                                                                                                                                                                                                         |
| `crate.usage()`                        | **Removed** — no v2 `/usage`. Live quota is on `CrateAPIError.rateLimit` (`X-RateLimit-*`); monthly quota/tier is not yet in v2.                                                                                                                                       |
| **Added:** `crate.label(key)`          | Cluster-first label dossier, promoted to a top-level method.                                                                                                                                                                                                           |
| **Added:** `{ fields }` on `artist()`  | Opt-out sparse-fieldset trim (default = the full dossier).                                                                                                                                                                                                             |

Need a removed capability today? It still lives on the frozen `/api/v1` — pin a `0.3.x` client for
it. crate's own guide: [`/docs/migration/v1-to-v2`](https://crate.hosaka.fm/docs/migration/v1-to-v2).

## Versioning & stability

Semantic Versioning. `1.0.0` is the first stable major, aligned with crate's `/api/v2`. The typed
surface is regenerated from `spec/openapi.json`, so types track the live crate contract; a CI drift
check fails the build if the committed types fall out of sync. Three carve-outs may ship as a minor:
type-only changes, undocumented internals, and changes with negligible runtime impact. See
[`CHANGELOG.md`](./CHANGELOG.md).

## Troubleshooting

| Symptom                                                         | Cause & fix                                                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `CrateValidationError('api_key_required')` with no network call | crate is key-first — construct `new Crate({ apiKey })`. The SDK guards locally _before_ any request; only `crate.index()` is keyless.       |
| `err instanceof CrateError` is `false`                          | The ESM/CJS dual-package boundary can load two copies of a class. Use the `isCrate*` guards (e.g. `isCrateError(err)`), never `instanceof`. |
| `artistOrNull(…)` returned `null`                               | That's an honest gap (a locator that resolved to no cluster), **not** an error — handle `null` as control flow. Only `4xx`/`5xx` throw.     |
| `crate.bandcamp` / `crate.master` is `undefined`                | Removed in 1.0 (cluster-first v2). See [Migrating from v1](#migrating-from-v1-0x) — the data moved into `artist()` or stayed on frozen v1.  |
| 429s get worse when I add retries                               | The SDK already retries `429/5xx` with backoff — remove your own retry loop. On a `429`, read `err.retryAfter` / `err.rateLimit`.           |
| `TypeError: fetch is not defined`                               | You're on a runtime without a global `fetch` (Node < 18). Upgrade to Node 18+, or pass a `fetch` implementation via the `fetch` option.     |

Full treatment: [docs/errors.md](./docs/errors.md) and [docs/configuration.md](./docs/configuration.md).

## Development

```sh
npm ci             # install (zero runtime deps; devDependencies only)
npm run generate   # regenerate src/generated/crate-api.d.ts + spec/meta.json from spec/openapi.json
npm run typecheck  # tsc --noEmit (incl. examples/)
npm run lint       # prettier --check
npm test           # vitest (unit + contract + dual-package + drift)
npm run build      # tsup → dual ESM + CJS in dist/
npm run check:exports  # @arethetypeswrong/cli (dual-package safety)
CRATE_LIVE_SMOKE=1 CRATE_API_KEY=ck_… npm test   # also runs one live keyed call against the API
```

CI runs the same gates on Node 18/20/22 and asserts zero runtime deps, tarball hygiene, and
dual-package type correctness. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Contributing, security, license

- **Contributing** — setup, Conventional Commits, and the codegen contract: [`CONTRIBUTING.md`](./CONTRIBUTING.md).
- **Security** — report privately via [GitHub Security Advisories](https://github.com/hosaka-fm/crate-sdk/security/advisories/new); never commit API keys: [`SECURITY.md`](./SECURITY.md).
- **Code of conduct** — [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).
- **License** — MIT, see [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE). The library is MIT; the
  crate API is governed separately by its Terms of Service and requires a key.

<div align="center"><sub>Built by Hosaka FM.</sub></div>
