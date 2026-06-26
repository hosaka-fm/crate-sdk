# @hosaka-fm/crate

The official, typed TypeScript client for the [crate](https://crate.0xhoneyjar.xyz)
public API — the hosaka fleet's music-catalogue aggregation gateway (artist / master /
label / festival dossiers + a Bandcamp data feed, keyed on the canonical `cluster_id`).

Think `stripe-node` / `@supabase/supabase-js`: typed methods, sensible conveniences,
automatic retries, cursor pagination, and teaching errors — over crate's public contract.
**AI agents are a first-class consumer** (see [Using from an AI agent](#using-from-an-ai-agent)).

> **License & access.** The MIT license (see `LICENSE`) covers _this client library's
> source_. Access to the crate API is governed separately by crate's Terms of Service and
> requires a valid API key; MIT grants no right to use the crate service itself. See `NOTICE`.

> **Status: pre-release (v0.3.0).** crate is **key-first** — every data endpoint requires an
> `apiKey` (sent as `X-API-Key`); only `crate.index()` is keyless. Keys are invite-only
> (operator-issued) today; a self-serve free tier lands later. Built + tagged in-repo; npm
> publish on the next go.

## Install

Published to **GitHub Packages** under the `@hosaka-fm` scope. Point the scope at the
GitHub registry (one-time, in your project's `.npmrc`) and authenticate with a GitHub
token that has `read:packages`:

```sh
echo "@hosaka-fm:registry=https://npm.pkg.github.com" >> .npmrc
npm install @hosaka-fm/crate
```

Requires **Node 18+** (uses the global `fetch`). Ships dual ESM + CJS with **zero runtime
dependencies**.

## Quick start

```ts
import { Crate } from '@hosaka-fm/crate';

const crate = new Crate({ apiKey: process.env.CRATE_API_KEY }); // required — crate is key-first

const artist = await crate.artist('Four Tet'); // name | slug | cluster_id | discogs:/mbid: → dossier
const id = await crate.resolve('https://fourtet.bandcamp.com'); // any link/name/id → identity
for await (const row of crate.bandcamp.bulk('signals_mbid')) {
  // auto-paginated rows
}
```

## Using from an AI agent

The SDK is built so an agent succeeds first-try and recovers from failures using the error
object alone — no external docs, no message parsing.

- **Forgiving inputs.** `resolve(...)` / `artist(...)` accept a bare string (a URL, a
  `discogs:`/`mbid:` locator, a 64-hex cluster_id, or a free-text name) or an explicit object.
- **Branch on `err.kind` / `err.code`**, never on the message. Every error carries
  `err.hint` (what's wrong) and `err.next` (a copy-pasteable corrected call).
- **Errors are JSON-safe.** `JSON.stringify(err)` preserves the teaching payload for logging
  and agent-to-agent handoff (a plain `Error` serializes to `{}`).
- **Prefer the `isCrate*` guards over `instanceof`** (they survive the ESM/CJS boundary).
- **Discover** the live API via `crate.index()`; read the static error dictionary from
  `CRATE_ERROR_REGISTRY` and the surface map from `CRATE_RESOURCES`.

```ts
import { Crate, isCrateError, isRateLimited, CRATE_ERROR_REGISTRY } from '@hosaka-fm/crate';

const crate = new Crate({ apiKey: process.env.CRATE_API_KEY }); // key-first; only crate.index() is keyless

try {
  const artist = await crate.artist('Four Tet');
  for await (const row of crate.bandcamp.bulkAll({ source: 'signals_mbid', maxPages: 3 })) {
    handle(row);
  }
} catch (err) {
  if (isCrateError(err)) {
    switch (err.kind) {
      case 'validation':
        console.error(`${err.code}: ${err.hint} → ${err.next}`); // the SDK tells you the fix
        break;
      case 'api': // narrowed to CrateAPIError
        console.error(`HTTP ${err.status} (${err.code})`);
        if (isRateLimited(err)) await wait(err.retryAfter);
        break;
      default:
        console.error(err.code);
    }
    log(JSON.stringify(err)); // JSON-safe teaching payload for handoff
  }
}
```

> This recipe is mirrored by `examples/agent.ts`, which is type-checked in CI so it can't rot.

**Every data method** throws `CrateValidationError('api_key_required')` immediately if called
without an `apiKey` (only `crate.index()` is keyless) — no confusing runtime 401. Beacon methods
(`searchEvents.observed` / `.refined`) instead require a caller-supplied `beaconToken`.

## Client surface

| Call                                                             | Endpoint                                    | Auth           |
| ---------------------------------------------------------------- | ------------------------------------------- | -------------- |
| `crate.index()`                                                  | `GET /api/v1`                               | anon           |
| `crate.resolve(q)`                                               | `GET /resolve`                              | **key**        |
| `crate.artist(key)` / `crate.artistOrNull(key)`                  | `GET /artist/{key}` (+resolve for locators) | **key**        |
| `crate.bandcamp(artistKey)`                                      | `GET /bandcamp/{artistKey}`                 | **key**        |
| `crate.bandcamp.bulk(params)` / `.bulkAll(params)` / `.index()`  | `GET /bandcamp`                             | **key**        |
| `crate.bandcamp.release({item\|url})` / `.releases({clusterId})` | `GET /bandcamp/release`                     | **key**        |
| `crate.search(params)`                                           | `GET /search`                               | **key**        |
| `crate.breakouts()`                                              | `GET /breakouts`                            | **key**        |
| `crate.tastemakers()` / `.onesToWatch()`                         | `GET /tastemakers[/ones-to-watch]`          | **key**        |
| `crate.dossier.{master,artist,label,festival,manifest}(...)`     | `GET /dossier/...`                          | **key**        |
| `crate.wayfind(question)` / `.interpret(q)`                      | `POST /wayfind/{answer,interpret}`          | **key**        |
| `crate.facets()`                                                 | `GET /facets`                               | **key**        |
| `crate.master(id)` / `crate.masters(ids)`                        | `GET /masters/{id}` · `POST /masters/batch` | **key**        |
| `crate.usage()`                                                  | `GET /usage`                                | **key**        |
| `crate.searchEvents.observed/refined(...)`                       | `POST /search-events/...`                   | **beacon JWT** |

### Bandcamp releases & honest gaps

`crate.bandcamp.release({ item })` / `({ url })` returns the per-release dossier (incl.
tracklist) or **`null`** when the release isn't present (an honest gap, HTTP 200 — not an
error). `crate.bandcamp.releases({ clusterId })` returns an artist's release summaries
(no tracklists). Known gaps, by design: **no direct audio stream** (`track.track_url` is the
track _page_; Bandcamp streams are tokenised/ToS-bound), and **no label/catalog** (not crawled).
`bandcamp_item_id` and `cluster_id` are **opaque strings** — pass them through, never numericize.
Artwork (`ArtworkItem[]` on releases + dossiers) is **link-only** (`rehost: false`).

## Errors

All failures throw a `CrateError` subclass with a `kind` discriminant and a `code`:

| `kind`                                              | class                                                         | retryable           | notes                                          |
| --------------------------------------------------- | ------------------------------------------------------------- | ------------------- | ---------------------------------------------- |
| `api`                                               | `CrateAPIError`                                               | iff 429/500/503/504 | `.status`, `.retryAfter`, `.requestId`, `.raw` |
| `network` / `timeout` / `abort`                     | `CrateNetworkError` / `CrateTimeoutError` / `CrateAbortError` | net/timeout: yes    | transport failures                             |
| `validation` / `not_found` / `parse` / `pagination` | `Crate{Validation,NotFound,Parse,Pagination}Error`            | no                  | client-side; carry `hint` + `next`             |

Auto-retry (429/5xx) uses full-jitter backoff and honors `Retry-After`. Construct with
`{ maxRetries, timeout, maxBackoffMs, totalDeadlineMs }` or override per call. On a `429`,
`CrateAPIError` carries `.retryAfter` and `.rateLimit` (`{ limit, remaining, reset }` from the
`X-RateLimit-*` headers). Tiers (per key): `self_serve_49` 60/min · 10k/mo · 2 concurrent;
`self_serve_99` 300/min · 50k/mo; `self_serve_299` 600/min · 250k/mo; `sync` 1000/min · 1M/mo.

## Development

```sh
npm ci             # install (zero runtime deps; devDependencies only)
npm run generate   # regenerate src/generated/crate-api.d.ts + spec/meta.json from spec/openapi.json
npm run typecheck  # tsc --noEmit (incl. examples/)
npm test           # vitest (unit + contract + dual-package + drift)
npm run build      # tsup → dual ESM + CJS in dist/
npm run check:exports  # @arethetypeswrong/cli (dual-package safety)
CRATE_LIVE_SMOKE=1 CRATE_API_KEY=ck_… npm test   # also runs one live keyed call against the API
```

## License

MIT — see `LICENSE` and `NOTICE`.
