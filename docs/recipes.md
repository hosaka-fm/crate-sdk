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

## Fetch a dossier

```ts
const a = await crate.artist('Four Tet'); // throws if a locator resolves to nothing
const maybe = await crate.artistOrNull('discogs:1'); // → ArtistDossierContract | null
const m = await crate.dossier.master(1234567); // per-grain dossier contract
```

## Page every Bandcamp release

```ts
for await (const row of crate.bandcamp.bulkAll({ source: 'signals_mbid', maxPages: 10 })) {
  handle(row);
}
```

## Get a release with its tracklist

```ts
const release = await crate.bandcamp.release({ item: '1234567890' }); // or { url }
if (release) {
  for (const t of release.tracks) console.log(t.track_num, t.title, t.duration_s);
} // null = honest gap (HTTP 200), not an error
```

## All of an artist's releases (summaries)

```ts
const id = await crate.resolve('Four Tet');
if (id.cluster_id) {
  const releases = await crate.bandcamp.releases({ clusterId: id.cluster_id });
}
```

## Search, breakouts, tastemakers

```ts
const hits = await crate.search({ genre: ['idm', 'ambient'], year_from: 2000, limit: 20 });
const breaking = await crate.breakouts();
const board = await crate.tastemakers();
const watch = await crate.tastemakers.onesToWatch();
```

## Batch master enrichment

```ts
const batch = await crate.masters([12345, 67890]); // 1..100 ids
console.log(batch.results.length, 'found,', batch.not_found.length, 'missing');
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

## Check your usage

```ts
const usage = await crate.usage();
console.log(`${usage.calls_this_month}/${usage.quota_monthly} on tier ${usage.tier}`);
```

More runnable examples in [`examples/`](../examples).
