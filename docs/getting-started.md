# Getting started

## Prerequisites

- **Node 18+** (the SDK uses the global `fetch`), or any runtime with a global `fetch` (Deno, Bun,
  Cloudflare Workers, Edge).
- **A crate API key.** crate is key-first — every data endpoint requires one. Keys are invite-only
  today; see the [crate docs](https://crate.0xhoneyjar.xyz/docs). Only `crate.index()` works without one.

## Install

```sh
npm install @hosaka-fm/crate   # or: pnpm add / yarn add / bun add
```

Dual ESM + CJS, zero runtime dependencies, types bundled.

## Your first call

```ts
import { Crate } from '@hosaka-fm/crate';

const crate = new Crate({ apiKey: process.env.CRATE_API_KEY });

const artist = await crate.artist('Four Tet');
console.log(artist.display, '→', artist.resolved_via);
```

`crate.artist(key)` accepts a name, a slug, a 64-hex `cluster_id`, or a `discogs:`/`mbid:` locator.
It returns a typed `ArtistDossierContract`. If you pass a locator that resolves to nothing it throws
`CrateNotFoundError` — use `crate.artistOrNull(key)` to get `null` instead.

## What you get back

Responses are fully typed off crate's OpenAPI spec — your editor autocompletes every field. A few
high-traffic returns:

- `crate.resolve(q)` → `IdentityResolution` (`cluster_id`, `slug`, `display`, `locators`, …)
- `crate.artist(key)` → `ArtistDossierContract` (cluster-first: carries `discography`,
  `bandcamp_emergence`, `bandcamp_tastemaker`)
- `crate.label(key)` → `LabelDossierContract`
- `crate.search(params)` → `SearchResponse`

## Next steps

- [Authentication](./authentication.md) — the three auth tiers and the fail-fast key guard.
- [Errors](./errors.md) — how failures are typed and how to branch on them.
- [Recipes](./recipes.md) — copy-paste snippets for every method.
- Runnable: [`examples/quickstart.ts`](../examples/quickstart.ts).
