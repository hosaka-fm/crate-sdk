// The single transport funnel every public method delegates to (SDD §4–§5).
// Builds the URL + headers, runs the retry/timeout loop, parses the body, and
// maps outcomes to typed results or CrateErrors.
import { CrateAbortError, CrateNetworkError, CrateParseError, CrateTimeoutError } from './errors';
import { apiErrorFromResponse } from './error-mapping';
import { computeDelay, isRetryableStatus, parseRetryAfter } from './retry';

const API_PREFIX = '/api/v1';
/** Cap on the preserved raw error body (`.raw`) — bounded handoff payloads. */
const RAW_CAP = 2048;

/** Fully-resolved transport config held by the Crate client. */
export interface HttpConfig {
  baseUrl: string;
  apiKey?: string;
  fetchImpl: typeof globalThis.fetch;
  timeoutMs: number;
  maxRetries: number;
  baseBackoffMs: number;
  backoffFactor: number;
  maxBackoffMs: number;
  maxRetryAfterMs: number;
  totalDeadlineMs: number | null;
  defaultHeaders: Record<string, string>;
  /** Injectable RNG for deterministic backoff in tests. */
  rand?: () => number;
}

export type QueryValue = string | number | boolean | string[] | undefined | null;

export interface RequestSpec {
  method: 'GET' | 'POST';
  /** Path under `/api/v1`, e.g. `/resolve`. */
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Whether the SDK retries this request on a retryable status (GETs + read-shaped POSTs true; beacons false). */
  idempotent: boolean;
  /** Beacon per-search JWT → `Authorization: Bearer`. */
  bearerToken?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  maxBackoffMs?: number;
  maxRetryAfterMs?: number;
  totalDeadlineMs?: number | null;
  headers?: Record<string, string>;
}

function buildUrl(config: HttpConfig, spec: RequestSpec): URL {
  const url = new URL(API_PREFIX + spec.path, config.baseUrl);
  if (spec.query) {
    for (const [key, value] of Object.entries(spec.query)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, item);
      } else {
        url.searchParams.append(key, String(value));
      }
    }
  }
  return url;
}

function buildHeaders(config: HttpConfig, spec: RequestSpec): Headers {
  // Precedence (low→high): constructor defaults < per-call headers < SDK-managed.
  // Headers is case-insensitive, so SDK-managed keys override any caller casing.
  const headers = new Headers();
  for (const [k, v] of Object.entries(config.defaultHeaders)) headers.set(k, v);
  for (const [k, v] of Object.entries(spec.headers ?? {})) headers.set(k, v);
  headers.set('Accept', 'application/json');
  if (spec.body !== undefined) headers.set('Content-Type', 'application/json');
  if (config.apiKey) headers.set('X-API-Key', config.apiKey);
  if (spec.bearerToken) headers.set('Authorization', `Bearer ${spec.bearerToken}`);
  return headers;
}

async function parseOk<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (text === '') return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new CrateParseError(`crate: response body was not valid JSON (status ${res.status})`, {
      status: res.status,
      raw: text.slice(0, RAW_CAP),
      cause: err,
    });
  }
}

// Read a non-2xx body best-effort. A non-JSON error body does NOT mask the HTTP
// status: we keep `.raw` and let apiErrorFromResponse build a status-based error
// (the status is the load-bearing signal for an agent). 2xx parse failures DO
// throw CrateParseError (above) — we can't return garbage as typed data.
async function readErrorBody(res: Response): Promise<{ body: unknown; raw?: string }> {
  let text: string;
  try {
    text = await res.text();
  } catch {
    return { body: undefined };
  }
  if (text === '') return { body: undefined };
  const raw = text.slice(0, RAW_CAP);
  try {
    return { body: JSON.parse(text), raw };
  } catch {
    return { body: undefined, raw };
  }
}

interface FetchInit {
  method: string;
  headers: Headers;
  body: string | undefined;
  signal?: AbortSignal;
}

// One fetch attempt with a cancelable per-attempt timeout composed with the
// caller's signal. Distinguishes timeout vs caller-abort vs network failure.
async function fetchOnce(
  config: HttpConfig,
  url: URL,
  init: FetchInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const onCallerAbort = () => controller.abort(init.signal?.reason);
  if (init.signal) init.signal.addEventListener('abort', onCallerAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException(`attempt exceeded ${timeoutMs}ms`, 'TimeoutError'));
  }, timeoutMs);

  try {
    return await config.fetchImpl(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      signal: controller.signal,
    });
  } catch (err) {
    if (timedOut) {
      throw new CrateTimeoutError(`crate: request exceeded ${timeoutMs}ms`, {
        timeoutMs,
        cause: err,
      });
    }
    if (init.signal?.aborted) {
      throw new CrateAbortError('crate: request aborted by caller', { cause: init.signal.reason });
    }
    throw new CrateNetworkError(
      `crate: network request failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      { cause: err },
    );
  } finally {
    clearTimeout(timer);
    if (init.signal) init.signal.removeEventListener('abort', onCallerAbort);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ms <= 0) {
      resolve();
      return;
    }
    const reject_ = () =>
      reject(
        new CrateAbortError('crate: request aborted by caller during backoff', {
          cause: signal?.reason,
        }),
      );
    if (signal?.aborted) {
      reject_();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject_();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Execute a request with retries. Returns the parsed JSON (typed `T`) on 2xx, or
 * throws a typed CrateError. The whole funnel for the SDK's surface.
 */
export async function request<T>(config: HttpConfig, spec: RequestSpec): Promise<T> {
  const url = buildUrl(config, spec);
  const headers = buildHeaders(config, spec);
  const body = spec.body !== undefined ? JSON.stringify(spec.body) : undefined;

  const maxRetries = spec.maxRetries ?? config.maxRetries;
  const perAttemptTimeout = spec.timeoutMs ?? config.timeoutMs;
  const maxRetryAfterMs = spec.maxRetryAfterMs ?? config.maxRetryAfterMs;
  const deadline =
    spec.totalDeadlineMs !== undefined ? spec.totalDeadlineMs : config.totalDeadlineMs;
  const rand = config.rand ?? Math.random;
  const backoff = {
    baseMs: config.baseBackoffMs,
    factor: config.backoffFactor,
    maxBackoffMs: config.maxBackoffMs,
  };

  const startedAt = Date.now();
  const remaining = (): number =>
    deadline == null ? Number.POSITIVE_INFINITY : deadline - (Date.now() - startedAt);

  const serverDelay = (serverMs: number): number =>
    Math.min(serverMs, maxRetryAfterMs) + Math.floor(rand() * config.baseBackoffMs); // jitter on top (anti-herd)

  let attempt = 0;
  for (;;) {
    if (spec.signal?.aborted) {
      throw new CrateAbortError('crate: request aborted by caller', { cause: spec.signal.reason });
    }

    const attemptTimeout = Math.max(1, Math.min(perAttemptTimeout, remaining()));

    let response: Response;
    try {
      response = await fetchOnce(
        config,
        url,
        { method: spec.method, headers, body, signal: spec.signal },
        attemptTimeout,
      );
    } catch (err) {
      const transportRetryable =
        (err instanceof CrateTimeoutError || err instanceof CrateNetworkError) &&
        spec.idempotent &&
        attempt < maxRetries;
      if (!transportRetryable) throw err;
      const delay = computeDelay(attempt, backoff, rand);
      if (delay >= remaining()) throw err;
      await sleep(delay, spec.signal);
      attempt += 1;
      continue;
    }

    if (response.ok) return parseOk<T>(response);

    const { body: errBody, raw } = await readErrorBody(response);
    const requestId = response.headers.get('x-request-id') ?? undefined;
    const retryAfterHeaderMs = parseRetryAfter(response.headers.get('retry-after'));
    const apiError = apiErrorFromResponse({
      status: response.status,
      body: errBody,
      requestId,
      raw,
      retryAfterHeaderMs,
    });

    const canRetry = spec.idempotent && isRetryableStatus(response.status) && attempt < maxRetries;
    if (!canRetry) throw apiError;

    const bodyRetryAfterSeconds =
      errBody &&
      typeof errBody === 'object' &&
      typeof (errBody as Record<string, unknown>).retry_after_seconds === 'number'
        ? ((errBody as Record<string, unknown>).retry_after_seconds as number)
        : undefined;
    const serverMs =
      retryAfterHeaderMs ??
      (bodyRetryAfterSeconds !== undefined &&
      Number.isFinite(bodyRetryAfterSeconds) &&
      bodyRetryAfterSeconds >= 0
        ? bodyRetryAfterSeconds * 1000
        : undefined);
    const delay =
      serverMs !== undefined ? serverDelay(serverMs) : computeDelay(attempt, backoff, rand);

    if (delay >= remaining()) throw apiError;
    await sleep(delay, spec.signal);
    attempt += 1;
  }
}
