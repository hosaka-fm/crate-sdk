// Bandcamp bulk pagination (SDD §6, agent-ergonomics ADX-8). A dual-iterable
// handle: `for await` yields rows; `.pages()` yields whole pages (for `_meta`).
// Driven solely by `next_cursor` (no `_links`); guarded against non-advancing /
// cycling cursors and malformed pages; `maxPages` ends iteration cleanly.
import { CratePaginationError } from './errors';
import type { BandcampBulkPage, BandcampRow } from './types';

export interface BandcampBulkParams {
  /** Feed source (omit → server default, e.g. `signals_mbid`). */
  source?: string;
  /** Resume cursor — pass `CratePaginationError.lastCursor` or `handle.cursor` to continue. */
  cursor?: string | null;
  /** Page size (client-clamped to 1..200 — a description-only bound, not in the schema). */
  limit?: number;
  /** Stop after this many pages, cleanly (`handle.truncated === true`, no throw). */
  maxPages?: number;
}

/** A resumable, dual-mode async iterable over a Bandcamp bulk feed. */
export interface BulkIterable<T = BandcampRow> extends AsyncIterable<T> {
  /** The last `next_cursor` consumed (null until a page is read / once exhausted). Re-passable to `bulk({ cursor })`. */
  readonly cursor: string | null;
  /** True if iteration stopped because `maxPages` was reached (a deliberate cap, not the end). */
  readonly truncated: boolean;
  /** Iterate whole {@link BandcampBulkPage} objects (exposes `_meta`) instead of rows. */
  pages(): AsyncIterableIterator<BandcampBulkPage>;
}

/** One-page fetch closure supplied by the client (carries auth, retry, signal). */
export type PageFetcher = (p: {
  source?: string;
  cursor?: string;
  limit?: number;
}) => Promise<BandcampBulkPage>;

export function makeBulkIterable<T = BandcampRow>(
  fetchPage: PageFetcher,
  params: BandcampBulkParams = {},
): BulkIterable<T> {
  const state: { cursor: string | null; truncated: boolean } = { cursor: null, truncated: false };
  const maxPages = params.maxPages;

  async function* pageGen(): AsyncIterableIterator<BandcampBulkPage> {
    const seen = new Set<string>();
    let nextCursor: string | undefined = params.cursor ?? undefined;
    if (nextCursor !== undefined) seen.add(nextCursor); // also catch a cycle back to the resume cursor
    let pageCount = 0;

    for (;;) {
      if (maxPages !== undefined && pageCount >= maxPages) {
        state.truncated = true;
        return;
      }

      const page = await fetchPage({
        source: params.source,
        cursor: nextCursor,
        limit: params.limit,
      });

      if (
        !page ||
        !Array.isArray(page.rows) ||
        !(page.next_cursor === null || typeof page.next_cursor === 'string')
      ) {
        throw new CratePaginationError('crate: bandcamp bulk returned a malformed page', {
          code: 'pagination_malformed_page',
          lastCursor: state.cursor,
          hint: '`rows` must be an array and `next_cursor` a string or null; retry, or report the source to crate support',
          next: `crate.bandcamp.bulk({ cursor: ${JSON.stringify(state.cursor)} })`,
        });
      }

      pageCount += 1;
      yield page;

      const advanced = page.next_cursor;
      state.cursor = advanced;
      if (advanced === null) return; // exhausted — clean end

      if (advanced === nextCursor || seen.has(advanced)) {
        throw new CratePaginationError('crate: bandcamp bulk cursor did not advance', {
          code: 'pagination_no_progress',
          lastCursor: advanced,
          hint: 'the server returned a repeating/cycling cursor — pagination cannot make progress; inspect, then report to crate support',
          next: `crate.bandcamp.bulk({ cursor: ${JSON.stringify(advanced)} })`,
        });
      }
      seen.add(advanced);
      nextCursor = advanced;
    }
  }

  async function* rowGen(): AsyncIterableIterator<T> {
    for await (const page of pageGen()) {
      for (const row of page.rows) yield row as T;
    }
  }

  return {
    [Symbol.asyncIterator]: rowGen,
    pages: pageGen,
    get cursor() {
      return state.cursor;
    },
    get truncated() {
      return state.truncated;
    },
  };
}
