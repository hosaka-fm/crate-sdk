import { describe, expect, it } from 'vitest';
import { computeDelay, isRetryableStatus, parseRetryAfter, RETRYABLE_STATUS } from '../src/retry';

describe('isRetryableStatus', () => {
  it('retries exactly {429,500,503,504}', () => {
    expect([...RETRYABLE_STATUS].sort()).toEqual([429, 500, 503, 504]);
    for (const s of [429, 500, 503, 504]) expect(isRetryableStatus(s)).toBe(true);
    for (const s of [200, 400, 401, 402, 404, 413, 501, 502])
      expect(isRetryableStatus(s)).toBe(false);
  });
});

describe('computeDelay (full-jitter)', () => {
  it('returns 0 when rand()=0 regardless of attempt', () => {
    const cfg = { baseMs: 500, factor: 2, maxBackoffMs: 8000 };
    for (const a of [0, 1, 2, 5]) expect(computeDelay(a, cfg, () => 0)).toBe(0);
  });
  it('returns the full ceiling when rand()→1 (exclusive), clamped to maxBackoffMs', () => {
    const cfg = { baseMs: 500, factor: 2, maxBackoffMs: 8000 };
    // ceiling: attempt0=500, attempt1=1000, attempt2=2000, attempt5=16000→capped 8000
    expect(computeDelay(0, cfg, () => 0.999999)).toBe(499);
    expect(computeDelay(1, cfg, () => 0.999999)).toBe(999);
    expect(computeDelay(2, cfg, () => 0.999999)).toBe(1999);
    expect(computeDelay(5, cfg, () => 0.999999)).toBe(7999); // capped
  });
  it('is monotonic in rand for a fixed attempt', () => {
    const cfg = { baseMs: 1000, factor: 2, maxBackoffMs: 60000 };
    expect(computeDelay(1, cfg, () => 0.25)).toBeLessThan(computeDelay(1, cfg, () => 0.75));
  });
});

describe('parseRetryAfter', () => {
  it('parses delta-seconds to ms', () => {
    expect(parseRetryAfter('120')).toBe(120000);
    expect(parseRetryAfter('0')).toBe(0);
  });
  it('parses an HTTP-date relative to now', () => {
    const now = Date.parse('2026-10-21T07:28:00Z');
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:30 GMT', now)).toBe(30000);
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:27:00 GMT', now)).toBe(0); // past → clamp to 0
  });
  it('returns undefined for absent/empty/garbage/negative', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter('')).toBeUndefined();
    expect(parseRetryAfter('   ')).toBeUndefined();
    expect(parseRetryAfter('soon')).toBeUndefined();
    expect(parseRetryAfter('-5')).toBeUndefined(); // not all-digits → date parse → NaN → undefined
  });
});
