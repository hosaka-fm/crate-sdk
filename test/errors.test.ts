import { describe, expect, it } from 'vitest';
import {
  CRATE_ERROR_CODES,
  CRATE_ERROR_KINDS,
  CRATE_ERROR_REGISTRY,
  CrateAPIError,
  CrateAbortError,
  CrateError,
  type CrateErrorKind,
  CrateNetworkError,
  CrateNotFoundError,
  CrateParseError,
  CratePaginationError,
  CrateTimeoutError,
  CrateValidationError,
  isCrateAPIError,
  isCrateError,
  isCrateValidationError,
  isRateLimited,
  isRetryable,
} from '../src/errors';

// One representative instance of every concrete class.
const instances: Record<CrateErrorKind, CrateError> = {
  api: new CrateAPIError('429 Too Many Requests (rate_limited)', {
    code: 'rate_limited',
    status: 429,
    retryable: true,
    retryAfter: 12,
    requestId: 'req_1',
    raw: '{"error":"rate_limited"}',
  }),
  network: new CrateNetworkError('network failed', { cause: new Error('ECONNRESET') }),
  timeout: new CrateTimeoutError('timed out', { timeoutMs: 30000 }),
  abort: new CrateAbortError('aborted'),
  validation: new CrateValidationError('needs exactly one of url|q|cluster|discogs|mbid', {
    code: 'exactly_one_of',
    hint: 'pass exactly one identifier',
    next: 'crate.resolve({ q: "Four Tet" })',
    param: 'query',
  }),
  parse: new CrateParseError('bad json', { status: 200, raw: '<html>' }),
  pagination: new CratePaginationError('cursor did not advance', {
    code: 'pagination_no_progress',
    lastCursor: 'abc',
    hint: 'the server returned the same cursor twice',
    next: 'crate.bandcamp.bulk({ cursor: "abc" })',
  }),
  not_found: new CrateNotFoundError('no cluster for that locator', {
    hint: 'the locator did not resolve',
    next: 'use crate.artistOrNull() to get null instead of a throw',
  }),
};

describe('kind discriminant + guards', () => {
  it('every concrete class sets the right kind, a hardcoded name, and a code', () => {
    expect(instances.api.name).toBe('CrateAPIError');
    expect(instances.network.name).toBe('CrateNetworkError');
    expect(instances.timeout.name).toBe('CrateTimeoutError');
    expect(instances.abort.name).toBe('CrateAbortError');
    expect(instances.validation.name).toBe('CrateValidationError');
    expect(instances.parse.name).toBe('CrateParseError');
    expect(instances.pagination.name).toBe('CratePaginationError');
    expect(instances.not_found.name).toBe('CrateNotFoundError');
    for (const kind of CRATE_ERROR_KINDS) {
      expect(instances[kind].kind).toBe(kind);
      expect(typeof instances[kind].code).toBe('string');
    }
  });

  it('brand-based guards recognize every instance (and instanceof still works)', () => {
    for (const kind of CRATE_ERROR_KINDS) {
      expect(isCrateError(instances[kind])).toBe(true);
      expect(instances[kind]).toBeInstanceOf(CrateError);
      expect(instances[kind]).toBeInstanceOf(Error);
    }
    expect(isCrateAPIError(instances.api)).toBe(true);
    expect(isCrateAPIError(instances.network)).toBe(false);
    expect(isCrateValidationError(instances.validation)).toBe(true);
    expect(isCrateError(new Error('plain'))).toBe(false);
    expect(isCrateError(null)).toBe(false);
    expect(isCrateError({ kind: 'api' })).toBe(false); // not branded
  });

  it('isRateLimited / isRetryable reflect status + kind', () => {
    expect(isRateLimited(instances.api)).toBe(true);
    expect(isRetryable(instances.api)).toBe(true);
    expect(isRetryable(instances.network)).toBe(true);
    expect(isRetryable(instances.timeout)).toBe(true);
    expect(isRetryable(instances.abort)).toBe(false);
    expect(isRetryable(instances.validation)).toBe(false);
    const notRetryable = new CrateAPIError('404 Not Found', {
      code: 'not_found',
      status: 404,
      retryable: false,
    });
    expect(isRetryable(notRetryable)).toBe(false);
    expect(isRateLimited(notRetryable)).toBe(false);
  });
});

describe('ADX-3: exported taxonomy', () => {
  it('CRATE_ERROR_KINDS is exactly the set of concrete class kinds', () => {
    const classKinds = new Set(Object.values(instances).map((e) => e.kind));
    expect(classKinds).toEqual(new Set(CRATE_ERROR_KINDS));
  });

  it('CRATE_ERROR_REGISTRY has one entry per kind, and retryable matches a representative instance', () => {
    expect(new Set(Object.keys(CRATE_ERROR_REGISTRY))).toEqual(new Set(CRATE_ERROR_KINDS));
    for (const kind of CRATE_ERROR_KINDS) {
      expect(CRATE_ERROR_REGISTRY[kind].retryable).toBe(instances[kind].retryable);
    }
  });

  it('CRATE_ERROR_CODES contains every client-minted code used by the SDK', () => {
    const clientCodes = [
      'exactly_one_of',
      'api_key_required',
      'beacon_token_required',
      'masters_arity',
      'base_url_has_path',
      'empty_key',
      'node_fetch_missing',
      'parse_error',
      'timeout',
      'aborted',
      'network_error',
      'pagination_no_progress',
      'pagination_malformed_page',
    ];
    for (const c of clientCodes) expect(CRATE_ERROR_CODES).toContain(c);
  });
});

describe('ADX-2: toJSON envelope is JSON-safe', () => {
  it('a plain Error serializes to {} but CrateError preserves the teaching payload', () => {
    expect(JSON.parse(JSON.stringify(new Error('x')))).toEqual({});
    const round = JSON.parse(JSON.stringify(instances.api));
    expect(round.kind).toBe('api');
    expect(round.code).toBe('rate_limited');
    expect(round.status).toBe(429);
    expect(round.retryable).toBe(true);
    expect(round.retryAfter).toBe(12);
    expect(round.requestId).toBe('req_1');
    expect(round.message).toContain('429');
  });

  it('round-trips kind + class-specific fields for every class', () => {
    expect(JSON.parse(JSON.stringify(instances.timeout)).timeoutMs).toBe(30000);
    expect(JSON.parse(JSON.stringify(instances.parse)).status).toBe(200);
    expect(JSON.parse(JSON.stringify(instances.pagination)).lastCursor).toBe('abc');
    const v = JSON.parse(JSON.stringify(instances.validation));
    expect(v.hint).toBeTruthy();
    expect(v.next).toBeTruthy();
    expect(v.param).toBe('query');
  });

  it('excludes .raw and the raw .cause object (bounded, no body/header leak)', () => {
    const apiJson = JSON.parse(JSON.stringify(instances.api));
    expect(apiJson.raw).toBeUndefined();
    const netJson = JSON.parse(JSON.stringify(instances.network));
    // cause is serialized to {name,message} only, never the raw object
    expect(netJson.cause).toEqual({ name: 'Error', message: 'ECONNRESET' });
  });
});

describe('ADX-4: client-side errors author the fix', () => {
  it('validation / not_found / pagination carry non-empty hint + a runnable .next call', () => {
    for (const e of [instances.validation, instances.not_found, instances.pagination]) {
      expect(e.hint && e.hint.length).toBeGreaterThan(0);
      expect(e.next && e.next.length).toBeGreaterThan(0);
      // ADX-4: .next is a copy-pasteable corrected call, not prose.
      expect(e.next).toMatch(/crate\.|new Crate\(/);
    }
  });
});
