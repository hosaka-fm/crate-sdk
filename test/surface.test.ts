import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { Crate } from '../src/client';
import {
  CrateNotFoundError,
  type CratePaginationError,
  type CrateValidationError,
  isCrateValidationError,
} from '../src/errors';

// Client surface over the REAL default global fetch (undici-backed), intercepted at
// the dispatcher layer. crate is KEY-FIRST: data calls go through a keyed client
// (`kc()`); `new Crate()` (keyless) is used only to test the guards. Error/retry
// timing is covered in http.test.ts.
const KEY = 'ck_test_0123456789abcdef0123456789abcd';
const kc = () => new Crate({ apiKey: KEY });

let agent: MockAgent;
// biome-ignore lint: test pool typing
let pool: ReturnType<MockAgent['get']>;
const ORIGIN = 'https://crate.0xhoneyjar.xyz';
let calls: Array<{ path: string; method: string; headers: Record<string, string>; body?: string }>;

function hget(h: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? h[key] : undefined;
}

beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  pool = agent.get(ORIGIN);
  calls = [];
});
afterEach(async () => {
  await agent.close();
});

function mock(
  method: 'GET' | 'POST',
  match: (p: string) => boolean,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
  persist = false,
): void {
  const scope = pool
    .intercept({ method, path: (p: string) => match(p) })
    // undici's MockResponseCallbackOptions is loosely typed; capture the fields we assert.
    // biome-ignore lint/suspicious/noExplicitAny: undici reply-callback options
    .reply((opts: any) => {
      calls.push({
        path: opts.path,
        method: opts.method,
        headers: (opts.headers ?? {}) as Record<string, string>,
        ...(opts.body !== undefined ? { body: opts.body } : {}),
      });
      return {
        statusCode: status,
        data: typeof body === 'string' ? body : JSON.stringify(body),
        responseOptions: { headers: { 'content-type': 'application/json', ...headers } },
      };
    });
  if (persist) scope.persist();
}

const HEX = 'a'.repeat(64);

describe('resolve', () => {
  it('bare string "Four Tet" → ?q=Four Tet', async () => {
    mock('GET', (p) => p.startsWith('/api/v1/resolve'), 200, { cluster_id: HEX, slug: 'four-tet' });
    const r = await kc().resolve('Four Tet');
    expect(r.cluster_id).toBe(HEX);
    expect(calls[0].path).toContain('q=Four+Tet');
  });

  it('bare locator "discogs:123" → ?discogs=123', async () => {
    mock('GET', (p) => p.startsWith('/api/v1/resolve'), 200, { cluster_id: HEX });
    await kc().resolve('discogs:123');
    expect(calls[0].path).toContain('discogs=123');
  });

  it('object { url } → ?url=', async () => {
    mock('GET', (p) => p.startsWith('/api/v1/resolve'), 200, { cluster_id: HEX });
    await kc().resolve({ url: 'https://x.bandcamp.com' });
    expect(decodeURIComponent(calls[0].path)).toContain('url=https://x.bandcamp.com');
  });

  it('empty string → CrateValidationError(exactly_one_of) before the key check, no network', async () => {
    const err = await kc()
      .resolve('')
      .catch((e) => e);
    expect(isCrateValidationError(err)).toBe(true);
    expect(err.code).toBe('exactly_one_of');
    expect(err.next).toContain('resolve');
    expect(calls).toHaveLength(0);
  });

  it('object with two identifiers → CrateValidationError', async () => {
    const err = await kc()
      .resolve({ q: 'a', url: 'b' } as never)
      .catch((e) => e);
    expect(isCrateValidationError(err)).toBe(true);
  });

  it('honest gap (200 + null cluster_id) passes through, does not throw', async () => {
    mock('GET', (p) => p.startsWith('/api/v1/resolve'), 200, {
      cluster_id: null,
      slug: null,
      note: 'unmappable',
    });
    const r = await kc().resolve({ url: 'https://unknown.example' });
    expect(r.cluster_id).toBeNull();
    expect(r.note).toBe('unmappable');
  });
});

describe('artist', () => {
  it('64-hex → direct /artist/{hex}', async () => {
    mock('GET', (p) => p.startsWith(`/api/v1/artist/${HEX}`), 200, { display: 'Four Tet' });
    await kc().artist(HEX);
    expect(calls[0].path).toBe(`/api/v1/artist/${HEX}`);
  });

  it('plain name → one-hop direct /artist/{name}', async () => {
    mock('GET', (p) => p.startsWith('/api/v1/artist/'), 200, { display: 'Four Tet' });
    await kc().artist('Four Tet');
    expect(calls[0].path).toBe('/api/v1/artist/Four%20Tet');
  });

  it('locator → resolve then /artist/{cluster}', async () => {
    mock('GET', (p) => p.startsWith('/api/v1/resolve'), 200, { cluster_id: HEX });
    mock('GET', (p) => p.startsWith(`/api/v1/artist/${HEX}`), 200, { display: 'Four Tet' });
    await kc().artist('discogs:123');
    expect(calls[0].path).toContain('/resolve?discogs=123');
    expect(calls[1].path).toBe(`/api/v1/artist/${HEX}`);
  });

  it('bare numeric → discogs resolve path (ADX-9)', async () => {
    mock('GET', (p) => p.startsWith('/api/v1/resolve'), 200, { cluster_id: HEX });
    mock('GET', (p) => p.startsWith(`/api/v1/artist/${HEX}`), 200, {});
    await kc().artist('1234567');
    expect(calls[0].path).toContain('discogs=1234567');
  });

  it('locator miss → CrateNotFoundError for artist(); null for artistOrNull()', async () => {
    mock('GET', (p) => p.startsWith('/api/v1/resolve'), 200, {
      cluster_id: null,
      note: 'no match',
    });
    const err = await kc()
      .artist('discogs:999')
      .catch((e) => e);
    expect(err).toBeInstanceOf(CrateNotFoundError);
    expect(err.hint).toBe('no match');
    expect(err.next).toContain('artistOrNull');

    mock('GET', (p) => p.startsWith('/api/v1/resolve'), 200, { cluster_id: null });
    expect(await kc().artistOrNull('discogs:999')).toBeNull();
  });

  it('empty/whitespace key → CrateValidationError(empty_key) before the key check, no network', async () => {
    let err: CrateValidationError | undefined;
    try {
      await kc().artist('   ');
    } catch (e) {
      err = e as CrateValidationError;
    }
    expect(err?.code).toBe('empty_key');
    expect(err?.next).toContain('crate.artist');
    expect(calls).toHaveLength(0);
  });
});

describe('bandcamp', () => {
  it('callable → /bandcamp/{artistKey}', async () => {
    mock('GET', (p) => p.startsWith(`/api/v1/bandcamp/${HEX}`), 200, {
      key: HEX,
      sources: [],
      _meta: {},
    });
    await kc().bandcamp(HEX);
    expect(calls[0].path).toBe(`/api/v1/bandcamp/${HEX}`);
  });

  it('bulkAll paginates rows across pages, terminates on null next_cursor', async () => {
    mock('GET', (p) => p.startsWith('/api/v1/bandcamp') && !p.includes('cursor='), 200, {
      source: 's',
      rows: [{ a: 1 }, { a: 2 }],
      next_cursor: 'c1',
      _meta: {},
    });
    mock('GET', (p) => p.includes('cursor=c1'), 200, {
      source: 's',
      rows: [{ a: 3 }],
      next_cursor: null,
      _meta: {},
    });
    const rows = [];
    for await (const row of kc().bandcamp.bulkAll({ source: 's' })) rows.push(row);
    expect(rows).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
  });

  it('maxPages stops cleanly (truncated, no throw) and exposes a resumable cursor', async () => {
    mock('GET', (p) => p.startsWith('/api/v1/bandcamp'), 200, {
      source: 's',
      rows: [{ a: 1 }],
      next_cursor: 'c1',
      _meta: {},
    });
    const handle = kc().bandcamp.bulkAll({ source: 's', maxPages: 1 });
    const rows = [];
    for await (const row of handle) rows.push(row);
    expect(rows).toEqual([{ a: 1 }]);
    expect(handle.truncated).toBe(true);
    expect(handle.cursor).toBe('c1'); // re-passable to bulk({ cursor })
  });

  it('non-advancing cursor → CratePaginationError', async () => {
    mock(
      'GET',
      () => true,
      200,
      { source: 's', rows: [{ a: 1 }], next_cursor: 'loop', _meta: {} },
      {},
      true,
    );
    const err = await (async () => {
      try {
        for await (const _ of kc().bandcamp.bulkAll({ source: 's' })) void _;
      } catch (e) {
        return e;
      }
    })();
    expect((err as Error).name).toBe('CratePaginationError');
  });

  it('empty artistKey → CrateValidationError(empty_key)', async () => {
    let err: CrateValidationError | undefined;
    try {
      await kc().bandcamp('');
    } catch (e) {
      err = e as CrateValidationError;
    }
    expect(err?.code).toBe('empty_key');
  });

  it('malformed page (rows not an array) → CratePaginationError with a runnable .next', async () => {
    mock('GET', (p) => p.startsWith('/api/v1/bandcamp'), 200, {
      source: 's',
      rows: 'nope',
      next_cursor: 'x',
      _meta: {},
    });
    const err = await (async () => {
      try {
        for await (const _ of kc().bandcamp.bulkAll({ source: 's' })) void _;
      } catch (e) {
        return e as CratePaginationError;
      }
    })();
    expect(err?.code).toBe('pagination_malformed_page');
    expect(err?.next).toContain('crate.bandcamp.bulk');
  });

  it('cycle back to the initial resume cursor → CratePaginationError (no infinite loop)', async () => {
    mock('GET', (p) => p.includes('cursor=c0'), 200, {
      source: 's',
      rows: [{}],
      next_cursor: 'c1',
      _meta: {},
    });
    mock('GET', (p) => p.includes('cursor=c1'), 200, {
      source: 's',
      rows: [{}],
      next_cursor: 'c0',
      _meta: {},
    });
    const err = await (async () => {
      try {
        for await (const _ of kc().bandcamp.bulkAll({ source: 's', cursor: 'c0' })) void _;
      } catch (e) {
        return e as CratePaginationError;
      }
    })();
    expect(err?.code).toBe('pagination_no_progress');
  });
});

describe('search', () => {
  it('serializes array facets as repeat-key + numbers as strings', async () => {
    mock('GET', (p) => p.startsWith('/api/v1/search'), 200, {
      query: '',
      pagination: {},
      facets: {},
      freshness: {},
      results: [],
    });
    await kc().search({ genre: ['idm', 'ambient'], year_from: 2000, limit: 5 });
    const path = calls[0].path;
    expect(path).toContain('genre=idm');
    expect(path).toContain('genre=ambient');
    expect(path).toContain('year_from=2000');
    expect(path).toContain('limit=5');
  });
});

describe('key-first auth', () => {
  it('a data method without an apiKey → CrateValidationError(api_key_required), no network', async () => {
    const err = await new Crate().resolve('Four Tet').catch((e) => e);
    expect(isCrateValidationError(err)).toBe(true);
    expect(err.code).toBe('api_key_required');
    expect(err.next).toContain('apiKey');
    expect(calls).toHaveLength(0);
  });

  it('facets() without apiKey → CrateValidationError(api_key_required), no network', async () => {
    const err = await new Crate().facets().catch((e) => e);
    expect(err.code).toBe('api_key_required');
    expect(calls).toHaveLength(0);
  });

  it('index() is the one keyless endpoint — works without an apiKey', async () => {
    mock('GET', (p) => p === '/api/v1', 200, { object: 'api_index', version: 'v1' });
    const idx = await new Crate().index();
    expect(idx.object).toBe('api_index');
    expect(hget(calls[0].headers, 'x-api-key')).toBeUndefined();
  });

  it('sends X-API-Key on data calls when constructed with apiKey', async () => {
    mock('GET', (p) => p.startsWith('/api/v1/facets'), 200, {});
    await new Crate({ apiKey: 'ck_test_abc' }).facets();
    expect(hget(calls[0].headers, 'x-api-key')).toBe('ck_test_abc');
  });

  it('masters() arity guard (empty / >100)', async () => {
    const crate = new Crate({ apiKey: 'ck_test_abc' });
    expect((await crate.masters([]).catch((e) => e)).code).toBe('masters_arity');
    expect((await crate.masters(Array(101).fill(1)).catch((e) => e)).code).toBe('masters_arity');
  });
});

describe('beacon', () => {
  it('observed() without beaconToken → CrateValidationError(beacon_token_required)', async () => {
    let err: CrateValidationError | undefined;
    try {
      await new Crate().searchEvents.observed(
        { search_event_id: 'x', source: 'swr-cache-hit' },
        {} as never,
      );
    } catch (e) {
      err = e as CrateValidationError;
    }
    expect(err?.code).toBe('beacon_token_required');
    expect(calls).toHaveLength(0);
  });

  it('observed() sends Authorization: Bearer (not X-API-Key), injects timestamp — even with an apiKey set', async () => {
    mock('POST', (p) => p.startsWith('/api/v1/search-events/observed'), 204, '');
    await new Crate({ apiKey: KEY }).searchEvents.observed(
      { search_event_id: 'evt-1', source: 'swr-cache-hit' },
      { beaconToken: 'jwt-123' },
    );
    expect(hget(calls[0].headers, 'authorization')).toBe('Bearer jwt-123');
    expect(hget(calls[0].headers, 'x-api-key')).toBeUndefined(); // beacon = bearer-only
    expect(JSON.parse(calls[0].body as string).timestamp).toBeTruthy(); // SDK-injected
  });
});

describe('construction', () => {
  it('baseUrl with a path → CrateValidationError(base_url_has_path)', () => {
    const err = (() => {
      try {
        return new Crate({ baseUrl: 'https://crate.0xhoneyjar.xyz/api' });
      } catch (e) {
        return e;
      }
    })();
    expect(isCrateValidationError(err)).toBe(true);
    expect((err as CrateValidationError).code).toBe('base_url_has_path');
  });
});
