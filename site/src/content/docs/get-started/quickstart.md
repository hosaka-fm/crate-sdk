---
title: Quickstart
description: Your first crate call in 60 seconds — keyless discovery first, then a keyed call.
---

crate is **key-first**: every data endpoint needs an `apiKey`. The one exception is
`crate.index()`, which is keyless — so you can get a green result before you have a key.

## 1. Install

```sh
npm install @hosaka-fm/crate
```

## 2. Discover the API with zero credentials

```ts
import { Crate } from '@hosaka-fm/crate';

const crate = new Crate(); // no key needed for index()
const root = await crate.index(); // self-describing root: resources + recipes + error catalogue
console.log(root.resources.map((r) => r.name));
```

## 3. Make a keyed call

```ts
const crate = new Crate({ apiKey: process.env.CRATE_API_KEY });
const artist = await crate.artist('Four Tet'); // name | slug | cluster_id | discogs:/mbid:
console.log(artist.display, '→', artist.resolved_via);
```

`crate.artist(key)` returns the full cluster-first dossier. Pass `{ fields: [...] }` to trim it.

:::note[Scaffold]
This page is a hand-authored guide. At Phase 1 it is sourced from the canonical
`examples/quickstart.ts` (type-checked in CI) so the snippet cannot drift from the real API.
:::
