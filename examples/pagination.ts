// Pagination — async-iterator over a Bandcamp bulk feed, plus pages() and resume.
// Type-checked in CI. In real code, import from '@hosaka-fm/crate'.
import { Crate, isCratePaginationError } from '../src/index';

async function main(): Promise<void> {
  const crate = new Crate({ apiKey: process.env.CRATE_API_KEY });

  // 1. Rows, auto-following cursors (the common case). maxPages caps it cleanly.
  for await (const row of crate.bandcamp.bulkAll({ source: 'signals_mbid', maxPages: 3 })) {
    console.log(Object.keys(row).length, 'fields');
  }

  // 2. Whole pages instead of rows — exposes _meta and the raw cursor.
  const handle = crate.bandcamp.bulkAll({ source: 'signals_mbid', maxPages: 2 });
  for await (const page of handle.pages()) {
    console.log(page._meta.note, '· next:', page.next_cursor);
  }
  if (handle.truncated) console.log('hit maxPages; resume from cursor:', handle.cursor);

  // 3. Resume after a pagination fault by re-passing lastCursor to bulk({ cursor }).
  try {
    for await (const row of crate.bandcamp.bulkAll({ source: 'signals_mbid' })) {
      void row;
    }
  } catch (err) {
    if (!isCratePaginationError(err)) throw err;
    const next = await crate.bandcamp.bulk({ cursor: err.lastCursor });
    console.log('resumed at', next.next_cursor);
  }
}

void main();
