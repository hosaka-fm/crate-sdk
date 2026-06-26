# Pagination

The Bandcamp bulk feed is paginated with keyset cursors. The SDK follows them for you — you almost
never touch a cursor directly.

## Stream rows (the common case)

```ts
for await (const row of crate.bandcamp.bulkAll({ source: 'signals_mbid' })) {
  handle(row); // row is Record<string, unknown> — the spec leaves rows open
}
```

`bulkAll(params)` returns a `BulkIterable` — an async iterable that yields rows and auto-advances
through pages until `next_cursor` is `null`.

### Cap the sweep

```ts
const handle = crate.bandcamp.bulkAll({ source: 'signals_mbid', maxPages: 5 });
for await (const row of handle) handle_row(row);
if (handle.truncated) console.log('stopped at maxPages, not the end. resume from', handle.cursor);
```

`maxPages` stops cleanly after N pages — `handle.truncated` becomes `true` (no throw), and
`handle.cursor` holds the last cursor consumed so you can continue later.

## Iterate whole pages (for `_meta`)

```ts
for await (const page of crate.bandcamp.bulkAll({ source: 'signals_mbid' }).pages()) {
  console.log(page.rows.length, page._meta, page.next_cursor);
}
```

`.pages()` yields full `BandcampBulkPage` objects (with `_meta` and the raw `next_cursor`) instead
of individual rows.

## One page at a time (manual keyset)

```ts
let cursor: string | null | undefined;
do {
  const page = await crate.bandcamp.bulk({ source: 'signals_mbid', cursor });
  for (const row of page.rows) handle(row);
  cursor = page.next_cursor;
} while (cursor);
```

`bulk(params)` fetches a single page (a `Promise`, not an iterable). Useful when you persist the
cursor between runs or processes.

## Resume after a fault

If the feed returns a non-advancing or cycling cursor, the SDK throws `CratePaginationError` rather
than looping forever. Its `.lastCursor` is re-passable to `bulk({ cursor })`:

```ts
import { isCratePaginationError } from '@hosaka-fm/crate';

try {
  for await (const row of crate.bandcamp.bulkAll({ source: 'signals_mbid' })) handle(row);
} catch (err) {
  if (!isCratePaginationError(err)) throw err;
  const next = await crate.bandcamp.bulk({ cursor: err.lastCursor }); // resume here
}
```

## Notes

- **Cursors are opaque strings.** Pass them through verbatim — never parse, increment, or numericize.
- **Typed rows.** Rows are `Record<string, unknown>` by design (the spec leaves row items open).
  Supply a narrower type with `bandcamp.bulkAll<MyRow>(...)` if you know the shape.
- Runnable: [`examples/pagination.ts`](../examples/pagination.ts).
