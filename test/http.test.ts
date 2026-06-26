import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CrateAbortError,
  CrateAPIError,
  CrateError,
  CrateNetworkError,
  CrateParseError,
  CrateTimeoutError,
} from '../src/errors';
import { type HttpConfig, request, type RequestSpec } from '../src/http';

// Inject a fetch stub (the SDD's `fetch?` test seam) — exercises the real http.ts
// loop with deterministic timing. The client-level undici MockAgent path is
// covered in the Sprint 3 integration + dual-package tests.
function cfg(overrides: Partial<HttpConfig> = {}): HttpConfig {
  return {
    baseUrl: 'https://crate.0xhoneyjar.xyz',
    fetchImpl: vi.fn(),
    timeoutMs: 30000,
    maxRetries: 2,
    baseBackoffMs: 500,
    backoffFactor: 2,
    maxBackoffMs: 8000,
    maxRetryAfterMs: 60000,
    totalDeadlineMs: 120000,
    defaultHeaders: {},
    rand: () => 0, // backoff → 0ms (no fake-timer advance needed unless Retry-After is set)
    ...overrides,
  };
}

function json(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const GET = (over: Partial<RequestSpec> = {}): RequestSpec => ({
  method: 'GET',
  path: '/resolve',
  idempotent: true,
  ...over,
});

/** Await a request expected to reject; return the typed error (and assert it threw). */
async function failsWith<T extends CrateError>(p: Promise<unknown>): Promise<T> {
  try {
    await p;
  } catch (e) {
    return e as T;
  }
  throw new Error('expected the request to reject, but it resolved');
}

const hanging = (): HttpConfig['fetchImpl'] => (_url, init) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () =>
      reject(init.signal?.reason ?? new Error('aborted')),
    );
  });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('happy path + request building', () => {
  it('returns parsed JSON, builds the /api/v1 URL + query, sends X-API-Key when set', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { cluster_id: 'abc' }));
    const result = await request<{ cluster_id: string }>(
      cfg({ fetchImpl, apiKey: 'ck_test_x' }),
      GET({ query: { q: 'Four Tet', limit: 5, genre: ['idm', 'ambient'] } }),
    );
    expect(result).toEqual({ cluster_id: 'abc' });
    const url = fetchImpl.mock.calls[0][0] as URL;
    expect(url.pathname).toBe('/api/v1/resolve');
    expect(url.searchParams.get('q')).toBe('Four Tet');
    expect(url.searchParams.get('limit')).toBe('5'); // number → string
    expect(url.searchParams.getAll('genre')).toEqual(['idm', 'ambient']); // array repeat-key
    const headers = fetchImpl.mock.calls[0][1].headers as Headers;
    expect(headers.get('x-api-key')).toBe('ck_test_x');
    expect(headers.get('accept')).toBe('application/json');
  });

  it('omits X-API-Key when no apiKey', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, {}));
    await request(cfg({ fetchImpl }), GET());
    expect((fetchImpl.mock.calls[0][1].headers as Headers).get('x-api-key')).toBeNull();
  });

  it('204 → undefined', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    expect(await request(cfg({ fetchImpl }), GET())).toBeUndefined();
  });
});

describe('retry policy', () => {
  it('retries 503 then succeeds (backoff 0 via rand=0)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(503, { error: 'server_error' }))
      .mockResolvedValueOnce(json(200, { ok: 1 }));
    expect(await request(cfg({ fetchImpl }), GET())).toEqual({ ok: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('honors Retry-After header (delta-seconds) before succeeding', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(429, { error: 'rate_limited' }, { 'retry-after': '2' }))
      .mockResolvedValueOnce(json(200, { ok: 1 }));
    const p = request(cfg({ fetchImpl }), GET());
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // still waiting on the 2s Retry-After
    await vi.advanceTimersByTimeAsync(2);
    expect(await p).toEqual({ ok: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('falls back to body retry_after_seconds when no header', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(429, { error: 'rate_limited', retry_after_seconds: 1 }))
      .mockResolvedValueOnce(json(200, { ok: 1 }));
    const p = request(cfg({ fetchImpl }), GET());
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toEqual({ ok: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry 400/401/402/404/413 — throws CrateAPIError with mapped code', async () => {
    for (const [status, code] of [
      [400, 'bad_request'],
      [401, 'unauthorized'],
      [402, 'payment_required'],
      [404, 'not_found'],
      [413, 'request_too_large'],
    ] as const) {
      const fetchImpl = vi.fn().mockResolvedValue(json(status, { error: code }));
      const err = await failsWith<CrateAPIError>(request(cfg({ fetchImpl }), GET()));
      expect(err).toBeInstanceOf(CrateAPIError);
      expect(err.status).toBe(status);
      expect(err.code).toBe(code);
      expect(err.retryable).toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('does NOT retry a non-idempotent (beacon) request on 503', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(503, { error: 'server_error' }));
    const err = await failsWith<CrateAPIError>(
      request(cfg({ fetchImpl }), {
        method: 'POST',
        path: '/search-events/observed',
        idempotent: false,
      }),
    );
    expect(err).toBeInstanceOf(CrateAPIError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('exhausts maxRetries then throws the last API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(503, { error: 'server_error' }));
    const err = await failsWith<CrateAPIError>(request(cfg({ fetchImpl, maxRetries: 2 }), GET()));
    expect(err).toBeInstanceOf(CrateAPIError);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it('preserves requestId from x-request-id header', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(json(500, { error: 'server_error' }, { 'x-request-id': 'req_42' }));
    const err = await failsWith<CrateAPIError>(request(cfg({ fetchImpl, maxRetries: 0 }), GET()));
    expect(err.requestId).toBe('req_42');
  });
});

describe('transport failures', () => {
  it('retries a network error then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(json(200, { ok: 1 }));
    expect(await request(cfg({ fetchImpl }), GET())).toEqual({ ok: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws CrateNetworkError when network failures exhaust retries', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const err = await failsWith<CrateNetworkError>(
      request(cfg({ fetchImpl, maxRetries: 1 }), GET()),
    );
    expect(err).toBeInstanceOf(CrateNetworkError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('per-attempt timeout → CrateTimeoutError', async () => {
    const p = request(cfg({ fetchImpl: hanging(), maxRetries: 0, timeoutMs: 5000 }), GET());
    const assertion = expect(p).rejects.toBeInstanceOf(CrateTimeoutError);
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });

  it('caller abort → CrateAbortError', async () => {
    const ac = new AbortController();
    const p = request(cfg({ fetchImpl: hanging() }), GET({ signal: ac.signal }));
    ac.abort(new Error('user cancelled'));
    await expect(p).rejects.toBeInstanceOf(CrateAbortError);
  });
});

describe('body parsing', () => {
  it('2xx with invalid JSON → CrateParseError carrying status + raw', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<not json>', { status: 200 }));
    const err = await failsWith<CrateParseError>(request(cfg({ fetchImpl }), GET()));
    expect(err).toBeInstanceOf(CrateParseError);
    expect(err.status).toBe(200);
    expect(err.raw).toContain('<not json>');
  });

  it('non-2xx with non-JSON body → CrateAPIError (status preserved) with raw', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response('<html>503</html>', { status: 503, headers: { 'content-type': 'text/html' } }),
      );
    const err = await failsWith<CrateAPIError>(request(cfg({ fetchImpl, maxRetries: 0 }), GET()));
    expect(err).toBeInstanceOf(CrateAPIError);
    expect(err.status).toBe(503);
    expect(err.raw).toContain('<html>503</html>');
  });
});
