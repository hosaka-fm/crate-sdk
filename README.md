<div align="center">

# @hosaka-fm/crate

**The official, typed TypeScript client for the [crate](https://crate.0xhoneyjar.xyz) public API** —
a music-catalogue aggregation gateway (artist / master / label / festival dossiers + a Bandcamp
data feed, keyed on the canonical `cluster_id`).

[![npm version](https://img.shields.io/npm/v/@hosaka-fm/crate.svg)](https://www.npmjs.com/package/@hosaka-fm/crate)
[![CI](https://github.com/hosaka-fm/crate-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/hosaka-fm/crate-sdk/actions/workflows/ci.yml)
[![types included](https://img.shields.io/badge/types-included-blue.svg)](https://github.com/hosaka-fm/crate-sdk)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://github.com/hosaka-fm/crate-sdk/blob/main/package.json)
[![minzipped size](https://img.shields.io/bundlephobia/minzip/@hosaka-fm/crate.svg)](https://bundlephobia.com/package/@hosaka-fm/crate)
[![Node 18+](https://img.shields.io/badge/node-%E2%89%A518-339933.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)

</div>

Think `stripe-node` / `@supabase/supabase-js`: **typed methods, automatic retries, cursor
pagination, and teaching errors** over crate's public contract. Built so a human reaches a
green result in 60 seconds — and so an **AI agent succeeds first-try and recovers from
failures using the error object alone**.

```ts
import { Crate } from '@hosaka-fm/crate';

const crate = new Crate({ apiKey: process.env.CRATE_API_KEY });

const artist = await crate.artist('Four Tet'); // name | slug | cluster_id | discogs:/mbid: → dossier
```

- 🧭 **Typed end to end.** Every parameter and response is generated from crate's live OpenAPI
  spec — full autocomplete, no `any`, no hand-written drift.
- 🔁 **Resilient by default.** Auto-retry on `429/5xx` with full-jitter backoff that honours
  `Retry-After`; per-attempt timeouts and a whole-call deadline. The SDK already retried — you don't.
- 📑 **Pagination that disappears.** `for await` over an async iterator; cursors are followed for you.
- 🧯 **Errors that teach.** Typed exceptions carry `.kind` / `.code`, a human `.hint`, and a
  copy-pasteable `.next` — and they're `JSON.stringify`-safe for logging and agent handoff.
- 🤖 **Agent-native.** Forgiving inputs, branch-on-code error handling, and a runtime-discoverable
  surface (`crate.index()`, `CRATE_RESOURCES`, `CRATE_ERROR_REGISTRY`). See [Using from an AI agent](#using-from-an-ai-agent).
- 📦 **Lean.** Dual ESM + CJS, **zero runtime dependencies**, tree-shakeable, types bundled.

> **License & access.** The MIT license (see [`LICENSE`](./LICENSE)) covers _this client
> library's source_. Access to the crate API is governed separately by crate's Terms of Service
> and requires a valid API key; MIT grants no right to use the crate service itself. See
> [`NOTICE`](./NOTICE).

> **Status — pre-release (`v0.3.0`).** crate is **key-first**: every data endpoint requires an
> `apiKey` (sent as `X-API-Key`); only `crate.index()` is keyless. Keys are invite-only
> (operator-issued) today; a self-serve tier lands later. Pre-`1.0`, minor versions may include
> breaking changes — see [Versioning](#versioning--stability).

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
- [Pagination](#pagination)
- [TypeScript](#typescript)
- [Compatibility](#compatibility)
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

// 1. Fetch an artist dossier from a name (or slug, cluster_id, or discogs:/mbid: locator).
const artist = await crate.artist('Four Tet');
console.log(artist.display, '→', artist.resolved_via); // "Four Tet" → "discogs"

// 2. Resolve any link / name / id to a canonical identity.
const id = await crate.resolve('https://fourtet.bandcamp.com');
console.log(id.cluster_id, id.locators.bandcamp);

// 3. Stream every row of a Bandcamp bulk feed — pagination is automatic.
for await (const row of crate.bandcamp.bulkAll({ source: 'signals_mbid', maxPages: 3 })) {
  handle(row);
}
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
[crate docs](https://crate.0xhoneyjar.xyz/docs). Full detail: [docs/authentication.md](./docs/authentication.md).

## Mental model

There is **one object**. Construct it once, and every capability hangs off it:

```ts
const crate = new Crate({ apiKey });

crate.artist(key); // top-level conveniences: resolve, search, breakouts, master(s), facets, usage, index
crate.bandcamp(artistKey); // callable namespace + .bulk / .bulkAll / .index / .release / .releases
crate.dossier.master(id); // per-grain dossiers: master, artist, label, festival, manifest
crate.tastemakers(); // callable + .onesToWatch()
crate.wayfind(question); // callable + .interpret()
crate.searchEvents.observed(body, { beaconToken });
```

Every example below starts from a constructed `crate`.

## Recipes

Copy-paste-runnable. Each is a single capability; see [docs/recipes.md](./docs/recipes.md) for more.

```ts
// Resolve any identifier (URL, name, 64-hex cluster_id, or discogs:/mbid: locator).
const id = await crate.resolve('Four Tet');

// Artist dossier — throw on an unresolved locator, or get null with artistOrNull().
const a = await crate.artist('discogs:1234');
const maybe = await crate.artistOrNull('discogs:999999'); // → null if unresolved

// A Bandcamp release with its tracklist (null = honest gap, HTTP 200, not an error).
const release = await crate.bandcamp.release({ item: '1234567890' });
if (release) for (const t of release.tracks) console.log(t.track_num, t.title);

// All of an artist's releases (summaries, no tracklists).
const releases = await crate.bandcamp.releases({ clusterId: id.cluster_id! });

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
- **Don't double-retry.** The SDK already retries `429/5xx` with backoff — wrapping calls in your
  own retry loop multiplies the wait. On a `429`, read `err.retryAfter` / `err.rateLimit`.
- **Prefer the `isCrate*` guards over `instanceof`** (they survive the ESM/CJS boundary).
- **Discover at runtime.** `crate.index()` (live root + cold-start recipe), `CRATE_RESOURCES`
  (the static surface map), `CRATE_ERROR_REGISTRY` (the error dictionary) — no doc lookup needed.

```ts
import { Crate, isCrateError, isRateLimited } from '@hosaka-fm/crate';

const crate = new Crate({ apiKey: process.env.CRATE_API_KEY });

try {
  const artist = await crate.artist('Four Tet');
  for await (const row of crate.bandcamp.bulkAll({ source: 'signals_mbid', maxPages: 3 })) {
    handle(row);
  }
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

| Call                                | Endpoint                         | Auth    | Returns                         |
| ----------------------------------- | -------------------------------- | ------- | ------------------------------- |
| `crate.resolve(query)`              | `GET /resolve`                   | **key** | `IdentityResolution`            |
| `crate.artist(key)`                 | `GET /artist/{key}`              | **key** | `ArtistDossierContract`         |
| `crate.artistOrNull(key)`           | `GET /artist/{key}`              | **key** | `ArtistDossierContract \| null` |
| `crate.search(params)`              | `GET /search`                    | **key** | `SearchResponse`                |
| `crate.breakouts()`                 | `GET /breakouts`                 | **key** | `BreakoutsResponse`             |
| `crate.index()`                     | `GET /api/v1`                    | anon    | `ApiRootIndex`                  |
| `crate.facets()`                    | `GET /facets`                    | **key** | `FacetCounts`                   |
| `crate.master(id)`                  | `GET /masters/{id}`              | **key** | `MasterEnrichment`              |
| `crate.masters(ids)`                | `POST /masters/batch`            | **key** | `BatchResponse`                 |
| `crate.usage()`                     | `GET /usage`                     | **key** | `UsageResponse`                 |
| `crate.bandcamp(artistKey)`         | `GET /bandcamp/{artistKey}`      | **key** | `BandcampFeedContract`          |
| `crate.bandcamp.bulk(params)`       | `GET /bandcamp`                  | **key** | `BandcampBulkPage`              |
| `crate.bandcamp.bulkAll(params)`    | `GET /bandcamp`                  | **key** | `BulkIterable`                  |
| `crate.bandcamp.index()`            | `GET /bandcamp`                  | **key** | `BandcampBulkPage`              |
| `crate.bandcamp.release(query)`     | `GET /bandcamp/release`          | **key** | `BandcampRelease \| null`       |
| `crate.bandcamp.releases(query)`    | `GET /bandcamp/release`          | **key** | `BandcampReleaseSummary[]`      |
| `crate.dossier.master(id)`          | `GET /dossier/master/{id}`       | **key** | `MasterDossierContract`         |
| `crate.dossier.artist(slug)`        | `GET /dossier/artist/{slug}`     | **key** | `ArtistDossierContract`         |
| `crate.dossier.label(slug)`         | `GET /dossier/label/{slug}`      | **key** | `LabelDossierContract`          |
| `crate.dossier.festival(slug)`      | `GET /dossier/festival/{slug}`   | **key** | `FestivalDossierContract`       |
| `crate.dossier.manifest()`          | `GET /dossier/manifest`          | **key** | `DossierManifest`               |
| `crate.tastemakers()`               | `GET /tastemakers`               | **key** | `TastemakersResponse`           |
| `crate.tastemakers.onesToWatch()`   | `GET /tastemakers/ones-to-watch` | **key** | `OnesToWatchResponse`           |
| `crate.wayfind(question)`           | `POST /wayfind/answer`           | **key** | `WayfindAnswerResponse`         |
| `crate.wayfind.interpret(q)`        | `POST /wayfind/interpret`        | **key** | `WayfindInterpretResponse`      |
| `crate.searchEvents.observed(body)` | `POST /search-events/observed`   | beacon  | `void`                          |
| `crate.searchEvents.refined(body)`  | `POST /search-events/refined`    | beacon  | `void`                          |

<!-- END GENERATED:surface -->

### Bandcamp releases & honest gaps

`crate.bandcamp.release({ item })` / `({ url })` returns the per-release dossier (incl. tracklist)
or **`null`** when the release isn't present (an honest gap, HTTP 200 — not an error).
`crate.bandcamp.releases({ clusterId })` returns an artist's release summaries (no tracklists).
Known gaps, by design: **no direct audio stream** (`track.track_url` is the track _page_; Bandcamp
streams are tokenised/ToS-bound), and **no label/catalog** (not crawled). `bandcamp_item_id` and
`cluster_id` are **opaque strings** — pass them through, never numericize. Artwork
(`ArtworkItem[]` on releases + dossiers) is **link-only** (`rehost: false`).

## Errors

Every failure throws a `CrateError` subclass with a `kind` discriminant and a machine-branchable `code`:

| `kind`                                              | class                                                         | retryable                      | notes                                                        |
| --------------------------------------------------- | ------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------ |
| `api`                                               | `CrateAPIError`                                               | iff 429/500/503/504            | `.status`, `.retryAfter`, `.rateLimit`, `.requestId`, `.raw` |
| `network` / `timeout` / `abort`                     | `CrateNetworkError` / `CrateTimeoutError` / `CrateAbortError` | net & timeout: yes · abort: no | transport failures                                           |
| `validation` / `not_found` / `parse` / `pagination` | `Crate{Validation,NotFound,Parse,Pagination}Error`            | no                             | client-side; carry `hint` + `next`                           |

HTTP status maps to `kind` predictably: `401 → validation` (`api_key_required`), `404 →
not_found`, `429 → api` (`isRateLimited`), `5xx → api` (retryable), transport faults `→
network`/`timeout`. Always log `err.requestId` (on every `CrateAPIError`) when contacting support.

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

| Option            | Default                        | Meaning                                                     |
| ----------------- | ------------------------------ | ----------------------------------------------------------- |
| `apiKey`          | —                              | customer key → `X-API-Key` (required for data endpoints)    |
| `baseUrl`         | `https://crate.0xhoneyjar.xyz` | API origin (no path)                                        |
| `fetch`           | global `fetch`                 | injectable `fetch` (tests / custom agents / older runtimes) |
| `timeout`         | `30000`                        | per-attempt timeout, ms                                     |
| `maxRetries`      | `2`                            | retries, not total sends; `0` disables                      |
| `maxBackoffMs`    | `8000`                         | full-jitter backoff cap, ms                                 |
| `maxRetryAfterMs` | `60000`                        | clamp on a server-directed `Retry-After`, ms                |
| `totalDeadlineMs` | `120000`                       | whole-call budget across retries, ms (`null` to disable)    |
| `headers`         | —                              | extra default headers (merged under SDK-managed ones)       |

Every knob is overridable per call via `RequestOptions` (plus `signal: AbortSignal`).
**Reliability model:** retries fire only on `429/500/503/504`, use full-jitter backoff, honour
`Retry-After` (clamped by `maxRetryAfterMs`), and stop at `totalDeadlineMs`. All read methods are
idempotent/safe. A caller `abort()` raises `CrateAbortError` (never retried); a deadline raises
`CrateTimeoutError` (retried). More: [docs/configuration.md](./docs/configuration.md).

## Pagination

```ts
// Rows, auto-following cursors (the common case):
for await (const row of crate.bandcamp.bulkAll({ source: 'signals_mbid' })) {
  /* … */
}

// Whole pages (exposes _meta) instead of rows:
for await (const page of crate.bandcamp.bulkAll({ source: 'signals_mbid' }).pages()) {
  console.log(page._meta, page.next_cursor);
}

// One page (manual keyset), or a bounded sweep:
const page = await crate.bandcamp.bulk({ source: 'signals_mbid' });
const handle = crate.bandcamp.bulkAll({ source: 'signals_mbid', maxPages: 5 });
```

Iteration ends when `next_cursor` is `null`; `maxPages` caps it cleanly (`handle.truncated ===
true`, no throw). On a stuck/cycling cursor the SDK throws `CratePaginationError`, whose
`.lastCursor` you re-pass to `bulk({ cursor })` to resume. Cursors are opaque strings — pass
through, never numericize. More: [docs/pagination.md](./docs/pagination.md).

## TypeScript

```ts
import { Crate, isCrateError, type ArtistDossierContract } from '@hosaka-fm/crate';
```

- **Generated types.** Params and responses are typed straight off crate's OpenAPI spec
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

## Versioning & stability

Semantic Versioning. **Pre-`1.0`, minor versions may include breaking changes.** The typed
surface is regenerated from `spec/openapi.json`, so types track the live crate API contract; a
CI drift check fails the build if the committed types fall out of sync. Three carve-outs may ship
as a minor even at/after `1.0`: type-only changes, undocumented internals, and changes with
negligible runtime impact. See [`CHANGELOG.md`](./CHANGELOG.md).

## Troubleshooting

| Symptom                                                         | Cause & fix                                                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `CrateValidationError('api_key_required')` with no network call | crate is key-first — construct `new Crate({ apiKey })`. The SDK guards locally _before_ any request; only `crate.index()` is keyless.       |
| `err instanceof CrateError` is `false`                          | The ESM/CJS dual-package boundary can load two copies of a class. Use the `isCrate*` guards (e.g. `isCrateError(err)`), never `instanceof`. |
| `bandcamp.release(…)` / `artistOrNull(…)` returned `null`       | That's an honest gap (HTTP 200, `present: false`), **not** an error — handle `null` as control flow. Only `4xx`/`5xx` throw.                |
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
