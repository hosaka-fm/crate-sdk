# Recipes

Copy-paste, single-capability snippets. Each assumes a constructed client:

```ts
import { Crate } from '@hosaka-fm/crate';
const crate = new Crate({ apiKey: process.env.CRATE_API_KEY });
```

## Resolve an identity

```ts
const id = await crate.resolve('Four Tet'); // name → identity
const byUrl = await crate.resolve('https://x.bandcamp.com'); // URL → identity
const byLoc = await crate.resolve({ discogs: 1234 }); // explicit locator
console.log(id.cluster_id, id.resolved_via, id.locators.bandcamp);
```

## Fetch an artist dossier

```ts
const a = await crate.artist('Four Tet'); // throws if a locator resolves to nothing
const maybe = await crate.artistOrNull('discogs:1'); // → ArtistDossierContract | null
a.discography; // pointer index of masters: { discogs_master_id, representative_name, _links.master }
a.bandcamp_emergence; // bandcamp is a dimension of the dossier, not a separate resource
```

## Fetch a label dossier

```ts
const label = await crate.label('warp-records'); // → LabelDossierContract
```

## Trim a dossier with ?fields=

```ts
// Default-rich: one call returns the full dossier. Pass `fields` only to TRIM.
const lean = await crate.artist('Four Tet', { fields: ['discography', 'bandcamp_emergence'] });
// An unknown field name → CrateAPIError(code: 'invalid_fields').
```

## Search, breakouts, tastemakers

```ts
const hits = await crate.search({ genre: ['idm', 'ambient'], year_from: 2000, limit: 20 });
const breaking = await crate.breakouts();
const board = await crate.tastemakers();
const watch = await crate.tastemakers.onesToWatch();
```

## Handle a 429 with the SDK's own retry metadata

```ts
import { isRateLimited } from '@hosaka-fm/crate';
try {
  await crate.search({ q: 'jungle' });
} catch (err) {
  if (isRateLimited(err)) {
    // The SDK already backed off; this is the server-directed ceiling.
    console.log('limit', err.rateLimit, 'retry after', err.retryAfter, 's');
  } else throw err;
}
```

## Cancel an in-flight call

```ts
const ac = new AbortController();
const p = crate.search({ q: 'ambient' }, { signal: ac.signal });
ac.abort(); // p rejects with CrateAbortError (never retried)
```

More runnable examples in [`examples/`](../examples).
