// Pure retry math (SDD §5). No I/O — the loop, timers, and AbortSignal wiring
// live in http.ts. Kept pure so backoff/jitter/Retry-After parsing are unit-tested
// in isolation with injected `rand`/`now`.

/** Retryable HTTP statuses — a safe over-approximation (per-op declarations are subsets). */
export const RETRYABLE_STATUS: ReadonlySet<number> = new Set([429, 500, 503, 504]);

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

export interface BackoffConfig {
  /** First-retry ceiling, ms. */
  baseMs: number;
  /** Exponential multiplier per attempt. */
  factor: number;
  /** Hard cap on the jittered delay, ms. */
  maxBackoffMs: number;
}

/**
 * Full-jitter exponential backoff: a uniform random value in
 * `[0, min(maxBackoffMs, baseMs * factor^attempt)]`. `attempt` is 0-based.
 * `rand` is injectable for deterministic tests.
 */
export function computeDelay(
  attempt: number,
  cfg: BackoffConfig,
  rand: () => number = Math.random,
): number {
  const ceiling = Math.min(cfg.maxBackoffMs, cfg.baseMs * cfg.factor ** attempt);
  return Math.floor(rand() * ceiling);
}

/**
 * Parse a `Retry-After` header. Accepts delta-seconds (`"120"`) or an HTTP-date
 * (`"Wed, 21 Oct 2026 07:28:00 GMT"`). Returns milliseconds, or `undefined` for
 * absent/empty/non-finite/negative values (caller then falls back to body or backoff).
 * `now` is injectable for deterministic tests.
 */
export function parseRetryAfter(
  header: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  if (header == null) return undefined;
  const s = header.trim();
  if (s === '') return undefined;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n * 1000 : undefined;
  }
  // Reject other number-like forms (negative / signed / decimal) as malformed —
  // only a non-negative integer or an HTTP-date is a valid Retry-After.
  if (/^[+-]?[\d.]+$/.test(s)) return undefined;
  const ts = Date.parse(s);
  if (Number.isNaN(ts)) return undefined;
  const delta = ts - now;
  return delta > 0 ? delta : 0;
}
