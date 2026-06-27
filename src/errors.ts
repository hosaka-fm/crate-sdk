// Typed error model for @hosaka-fm/crate (SDD §7 + agent-ergonomics ADX-2/3/4).
//
// A single abstract `CrateError` root carries a `kind` discriminant so callers
// (especially AI agents) branch with `switch (err.kind)` — no `instanceof`, no
// message parsing. Guards are BRAND-based (`Symbol.for`) so they survive the
// dual ESM+CJS package boundary, where `instanceof` would see two distinct
// classes. Every error is JSON-safe (`toJSON`) so the teaching payload survives
// logging and agent-to-agent handoff.

/** Global brand — identical across ESM/CJS copies because `Symbol.for` is a global registry. */
const BRAND: unique symbol = Symbol.for('hosaka.crate.error');

/** Every error kind the SDK can throw. Branch on `err.kind`. */
export const CRATE_ERROR_KINDS = [
  'api',
  'network',
  'timeout',
  'abort',
  'validation',
  'parse',
  'pagination',
  'not_found',
] as const;
export type CrateErrorKind = (typeof CRATE_ERROR_KINDS)[number];

/** Known `.code` values. The field is `CrateErrorCode` so novel future server codes still type-check. */
export const CRATE_ERROR_CODES = [
  // server-sourced — the machine `error` codes crate documents (spec 1.4.0); switch on these.
  'invalid_artist_key',
  'use_resolve_for_locator',
  'missing_locator',
  'invalid_locator',
  'invalid_source_or_cursor',
  'invalid_query',
  'invalid_facet',
  'master_not_found',
  'rate_limited',
  // SDK status fallbacks — synthesized only when an error body carries no `error` field.
  'bad_request',
  'unauthorized',
  'payment_required',
  'not_found',
  'request_too_large',
  'server_error',
  'api_error',
  // client-minted (the SDK authored the failure)
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
] as const;
export type KnownCrateErrorCode = (typeof CRATE_ERROR_CODES)[number];
// `& {}` preserves autocomplete on the known set without rejecting future server codes.
export type CrateErrorCode = KnownCrateErrorCode | (string & {});

/** Per-kind metadata an agent can read without source access. */
export interface ErrorKindInfo {
  /** Does the SDK auto-retry this kind under the default policy? */
  readonly retryable: boolean;
  /** Is this a client-side failure (vs. an HTTP response)? */
  readonly clientSide: boolean;
  /** Notable fields this kind carries beyond the base. */
  readonly carries: readonly string[];
  /** When the SDK throws it. */
  readonly whenThrown: string;
}

export const CRATE_ERROR_REGISTRY: Record<CrateErrorKind, ErrorKindInfo> = {
  api: {
    retryable: true,
    clientSide: false,
    carries: ['status', 'retryable', 'retryAfter', 'requestId', 'masterId', 'details', 'raw'],
    whenThrown: 'a non-2xx HTTP response (retryable iff status ∈ {429,500,503,504})',
  },
  network: {
    retryable: true,
    clientSide: true,
    carries: ['cause'],
    whenThrown: 'a transport failure before any response was received',
  },
  timeout: {
    retryable: true,
    clientSide: true,
    carries: ['timeoutMs'],
    whenThrown: 'a per-attempt or total-deadline timeout',
  },
  abort: {
    retryable: false,
    clientSide: true,
    carries: ['cause'],
    whenThrown: 'the caller aborted via their AbortSignal',
  },
  validation: {
    retryable: false,
    clientSide: true,
    carries: ['param', 'hint', 'next'],
    whenThrown: 'a client-side argument guard failed (always carries hint + next)',
  },
  parse: {
    retryable: false,
    clientSide: true,
    carries: ['status', 'raw'],
    whenThrown: 'a response body was not valid JSON (2xx or error)',
  },
  pagination: {
    retryable: false,
    clientSide: true,
    carries: ['lastCursor', 'hint', 'next'],
    whenThrown: 'bulk pagination hit a non-advancing/cycling cursor or a malformed page',
  },
  not_found: {
    retryable: false,
    clientSide: true,
    carries: ['hint', 'next'],
    whenThrown: 'artist() resolved a locator to a null cluster_id (honest gap)',
  },
};

/** Rate-limit headers (`X-RateLimit-Limit/Remaining/Reset`) surfaced on a `CrateAPIError` for client-side quota visibility. */
export interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  reset?: number;
}

/** Stable, JSON-safe envelope produced by `CrateError.toJSON()` (ADX-2). Excludes `.raw` and the raw `.cause`. */
export interface CrateErrorJSON {
  name: string;
  kind: CrateErrorKind;
  code: CrateErrorCode;
  message: string;
  status?: number;
  retryable?: boolean;
  retryAfter?: number;
  requestId?: string;
  masterId?: number;
  rateLimit?: RateLimitInfo;
  timeoutMs?: number;
  lastCursor?: string | null;
  param?: string;
  hint?: string;
  docUrl?: string;
  next?: string;
  details?: unknown[];
  cause?: { name: string; message: string };
}

interface BaseOpts {
  code: CrateErrorCode;
  hint?: string;
  docUrl?: string;
  next?: string;
  param?: string;
  cause?: unknown;
}

/**
 * Abstract root of every error thrown by the SDK. Never instantiated directly.
 * Branch on {@link CrateError.kind}; prefer the exported `isCrate*` guards over `instanceof`.
 */
export abstract class CrateError extends Error {
  /** Discriminant for `switch (err.kind)`. See {@link CRATE_ERROR_KINDS}. */
  abstract readonly kind: CrateErrorKind;
  /** Machine-branchable code. See {@link CRATE_ERROR_CODES}. */
  readonly code: CrateErrorCode;
  /** One-line, actionable remediation. Always present on client-side errors (ADX-4). */
  readonly hint?: string;
  /** A docs URL for this failure, when known. */
  readonly docUrl?: string;
  /** A copy-pasteable corrected call. Always present on client-side errors (ADX-4). */
  readonly next?: string;
  /** The offending argument name, when applicable. */
  readonly param?: string;

  constructor(message: string, opts: BaseOpts) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.code = opts.code;
    if (opts.hint !== undefined) this.hint = opts.hint;
    if (opts.docUrl !== undefined) this.docUrl = opts.docUrl;
    if (opts.next !== undefined) this.next = opts.next;
    if (opts.param !== undefined) this.param = opts.param;
  }

  /** Whether the SDK's default policy retries this error. Overridden where true. */
  get retryable(): boolean {
    return false;
  }

  /**
   * JSON-safe representation (a plain `Error` serializes to `{}`). Deliberately
   * omits `.raw` (bounded handoff payloads) and serializes `.cause` to `{name,message}`
   * only (never leak response bodies/headers into logs). Stable contract (ADX-2).
   */
  toJSON(): CrateErrorJSON {
    const json: CrateErrorJSON = {
      name: this.name,
      kind: this.kind,
      code: this.code,
      message: this.message,
    };
    if (this.hint !== undefined) json.hint = this.hint;
    if (this.docUrl !== undefined) json.docUrl = this.docUrl;
    if (this.next !== undefined) json.next = this.next;
    if (this.param !== undefined) json.param = this.param;
    if (this.cause instanceof Error)
      json.cause = { name: this.cause.name, message: this.cause.message };
    return json;
  }
}
// Brand on the prototype (non-enumerable, shared) — the basis for cross-realm guards.
Object.defineProperty(CrateError.prototype, BRAND, { value: true, enumerable: false });

/** A non-2xx HTTP response. */
export class CrateAPIError extends CrateError {
  readonly kind = 'api' as const;
  readonly status: number;
  readonly details?: unknown[];
  readonly retryAfter?: number;
  readonly masterId?: number;
  readonly requestId?: string;
  /** Rate-limit headers (limit/remaining/reset), when crate sent them. */
  readonly rateLimit?: RateLimitInfo;
  /** The raw (size-capped) response body — escape hatch for fields the SDK doesn't model. Excluded from `toJSON`. */
  readonly raw?: string;
  readonly #retryable: boolean;

  constructor(
    message: string,
    opts: BaseOpts & {
      status: number;
      retryable: boolean;
      details?: unknown[];
      retryAfter?: number;
      masterId?: number;
      requestId?: string;
      rateLimit?: RateLimitInfo;
      raw?: string;
    },
  ) {
    super(message, opts);
    this.name = 'CrateAPIError';
    this.status = opts.status;
    this.#retryable = opts.retryable;
    if (opts.details !== undefined) this.details = opts.details;
    if (opts.retryAfter !== undefined) this.retryAfter = opts.retryAfter;
    if (opts.masterId !== undefined) this.masterId = opts.masterId;
    if (opts.requestId !== undefined) this.requestId = opts.requestId;
    if (opts.rateLimit !== undefined) this.rateLimit = opts.rateLimit;
    if (opts.raw !== undefined) this.raw = opts.raw;
  }

  override get retryable(): boolean {
    return this.#retryable;
  }

  override toJSON(): CrateErrorJSON {
    const json = super.toJSON();
    json.status = this.status;
    json.retryable = this.retryable;
    if (this.retryAfter !== undefined) json.retryAfter = this.retryAfter;
    if (this.requestId !== undefined) json.requestId = this.requestId;
    if (this.masterId !== undefined) json.masterId = this.masterId;
    if (this.rateLimit !== undefined) json.rateLimit = this.rateLimit;
    if (this.details !== undefined) json.details = this.details;
    return json;
  }
}

/** A transport failure before any response was received. Retryable. */
export class CrateNetworkError extends CrateError {
  readonly kind = 'network' as const;
  constructor(message: string, opts: { cause?: unknown } = {}) {
    super(message, { code: 'network_error', cause: opts.cause });
    this.name = 'CrateNetworkError';
  }
  override get retryable(): boolean {
    return true;
  }
}

/** A per-attempt or total-deadline timeout (distinct from a caller abort). Retryable. */
export class CrateTimeoutError extends CrateError {
  readonly kind = 'timeout' as const;
  readonly timeoutMs: number;
  constructor(message: string, opts: { timeoutMs: number; cause?: unknown }) {
    super(message, { code: 'timeout', cause: opts.cause });
    this.name = 'CrateTimeoutError';
    this.timeoutMs = opts.timeoutMs;
  }
  override get retryable(): boolean {
    return true;
  }
  override toJSON(): CrateErrorJSON {
    const json = super.toJSON();
    json.timeoutMs = this.timeoutMs;
    return json;
  }
}

/** The caller aborted via their `AbortSignal`. Never retried. */
export class CrateAbortError extends CrateError {
  readonly kind = 'abort' as const;
  constructor(message: string, opts: { cause?: unknown } = {}) {
    super(message, { code: 'aborted', cause: opts.cause });
    this.name = 'CrateAbortError';
  }
}

/** A client-side argument guard failed. Always carries `hint` + `next` (ADX-4). */
export class CrateValidationError extends CrateError {
  readonly kind = 'validation' as const;
  constructor(
    message: string,
    opts: { code: CrateErrorCode; hint: string; next: string; param?: string; docUrl?: string },
  ) {
    super(message, opts);
    this.name = 'CrateValidationError';
  }
}

/** `artist()` resolved a locator/name to a null cluster_id (honest gap). Carries `hint` + `next` (ADX-4). */
export class CrateNotFoundError extends CrateError {
  readonly kind = 'not_found' as const;
  constructor(message: string, opts: { hint: string; next: string; docUrl?: string }) {
    super(message, { code: 'not_found', ...opts });
    this.name = 'CrateNotFoundError';
  }
}

/** A response body was not valid JSON (2xx or error). */
export class CrateParseError extends CrateError {
  readonly kind = 'parse' as const;
  readonly status: number;
  readonly raw?: string;
  constructor(message: string, opts: { status: number; raw?: string; cause?: unknown }) {
    super(message, { code: 'parse_error', cause: opts.cause });
    this.name = 'CrateParseError';
    this.status = opts.status;
    if (opts.raw !== undefined) this.raw = opts.raw;
  }
  override toJSON(): CrateErrorJSON {
    const json = super.toJSON();
    json.status = this.status;
    return json;
  }
}

/** Bulk pagination hit a non-advancing/cycling cursor or a malformed page. Carries `lastCursor` (ADX-8). */
export class CratePaginationError extends CrateError {
  readonly kind = 'pagination' as const;
  /** The last cursor consumed — re-passable to `bandcamp.bulk({ cursor })` to resume. */
  readonly lastCursor: string | null;
  constructor(
    message: string,
    opts: {
      code: 'pagination_no_progress' | 'pagination_malformed_page';
      lastCursor: string | null;
      hint: string;
      next: string;
    },
  ) {
    super(message, { code: opts.code, hint: opts.hint, next: opts.next });
    this.name = 'CratePaginationError';
    this.lastCursor = opts.lastCursor;
  }
  override toJSON(): CrateErrorJSON {
    const json = super.toJSON();
    json.lastCursor = this.lastCursor;
    return json;
  }
}

/**
 * The discriminated union of every concrete error the SDK throws. Narrowing on
 * `.kind` (e.g. inside `switch`) selects the right subclass and its fields — so
 * after `if (isCrateError(err))`, `case 'api'` gives you `err.status` etc.
 */
export type AnyCrateError =
  | CrateAPIError
  | CrateNetworkError
  | CrateTimeoutError
  | CrateAbortError
  | CrateValidationError
  | CrateNotFoundError
  | CrateParseError
  | CratePaginationError;

// --- Brand-based type guards (survive dual ESM+CJS; prefer over instanceof) ---

function hasBrand(v: unknown): v is AnyCrateError {
  return typeof v === 'object' && v !== null && (v as Record<symbol, unknown>)[BRAND] === true;
}

export function isCrateError(v: unknown): v is AnyCrateError {
  return hasBrand(v);
}
export function isCrateAPIError(v: unknown): v is CrateAPIError {
  return hasBrand(v) && v.kind === 'api';
}
export function isCrateNetworkError(v: unknown): v is CrateNetworkError {
  return hasBrand(v) && v.kind === 'network';
}
export function isCrateTimeoutError(v: unknown): v is CrateTimeoutError {
  return hasBrand(v) && v.kind === 'timeout';
}
export function isCrateAbortError(v: unknown): v is CrateAbortError {
  return hasBrand(v) && v.kind === 'abort';
}
export function isCrateValidationError(v: unknown): v is CrateValidationError {
  return hasBrand(v) && v.kind === 'validation';
}
export function isCrateNotFoundError(v: unknown): v is CrateNotFoundError {
  return hasBrand(v) && v.kind === 'not_found';
}
export function isCrateParseError(v: unknown): v is CrateParseError {
  return hasBrand(v) && v.kind === 'parse';
}
export function isCratePaginationError(v: unknown): v is CratePaginationError {
  return hasBrand(v) && v.kind === 'pagination';
}
/** A rate-limit (HTTP 429) error, carrying `retryAfter`. */
export function isRateLimited(v: unknown): v is CrateAPIError {
  return isCrateAPIError(v) && v.status === 429;
}
/** Whether the SDK's default policy would retry this error. */
export function isRetryable(v: unknown): v is CrateError {
  return hasBrand(v) && v.retryable;
}
