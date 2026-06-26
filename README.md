# @hosaka/crate

The official, typed TypeScript client for the [crate](https://crate.0xhoneyjar.xyz)
public API — the hosaka fleet's music-catalogue aggregation gateway (artist / master /
label / festival dossiers + a Bandcamp data feed, keyed on the canonical `cluster_id`).

Think `stripe-node` / `@supabase/supabase-js`: typed methods, sensible conveniences,
automatic retries, cursor pagination, and teaching errors — over crate's public contract.

> **License & access.** The MIT license (see `LICENSE`) covers _this client library's
> source_. Access to the crate API is governed separately by crate's Terms of Service and
> requires a valid API key; MIT grants no right to use the crate service itself. See
> `NOTICE`.

> **Status: pre-release.** Built and tagged in-repo; **not yet published to npm** — publish
> is gated until crate's API key model lands. The client already works against the public
> (anonymous) surface today and gains keyed access by passing an `apiKey` — no code change
> needed when walling lands.

## Install

```sh
npm install @hosaka/crate   # available once published; build from source until then
```

Requires **Node 18+** (uses the global `fetch`). Ships dual ESM + CJS with zero runtime
dependencies.

## Quick start

```ts
import { Crate } from '@hosaka/crate';

const crate = new Crate({ apiKey: process.env.CRATE_API_KEY }); // apiKey optional (public today)

const artist = await crate.artist('Four Tet'); // name | cluster_id | slug → dossier
const id = await crate.resolve({ url: someLink }); // any link/name/id → identity
for await (const row of crate.bandcamp.bulk('emergence')) {
  // auto-paginated rows
}
```

The full client surface, error model, and an **"using @hosaka/crate from an AI agent"**
guide land with the Sprint 3 implementation.

## Development

```sh
npm ci            # install (zero runtime deps; devDependencies only)
npm run generate  # regenerate src/generated/crate-api.d.ts from spec/openapi.json
npm test          # vitest (incl. the offline types-drift gate)
npm run build     # tsup → dual ESM + CJS in dist/
```

## License

MIT — see `LICENSE` and `NOTICE`.
