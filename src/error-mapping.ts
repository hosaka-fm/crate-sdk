// Map a non-2xx HTTP response to a CrateAPIError (SDD §7). Reason phrases come
// from a table (never trust Response.statusText — empty over HTTP/2 + Cloudflare).
// Teaching fields (hint/doc_url/next/param) are read DEFENSIVELY: the published
// Error schema doesn't declare them, but the schema is open and the API owner
// emits them at runtime, so we surface them only when present + correctly typed.
import { CrateAPIError, type CrateErrorCode } from './errors';
import { isRetryableStatus } from './retry';

const REASON: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  413: 'Payload Too Large',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

const STATUS_CODE: Record<number, CrateErrorCode> = {
  400: 'bad_request',
  401: 'unauthorized',
  402: 'payment_required',
  404: 'not_found',
  413: 'request_too_large',
  429: 'rate_limited',
};

function codeForStatus(status: number): CrateErrorCode {
  return STATUS_CODE[status] ?? (status >= 500 ? 'server_error' : 'api_error');
}

export interface ApiErrorInput {
  status: number;
  /** Parsed JSON body (or `undefined`/`{}` when the body was empty or non-JSON). */
  body: unknown;
  requestId?: string;
  /** Size-capped raw body text, preserved on `.raw`. */
  raw?: string;
  /** Retry-After header in ms, if present (header takes precedence over body for the field too). */
  retryAfterHeaderMs?: number;
}

export function apiErrorFromResponse(input: ApiErrorInput): CrateAPIError {
  const { status, body, requestId, raw, retryAfterHeaderMs } = input;
  const b: Record<string, unknown> =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const str = (k: string): string | undefined =>
    typeof b[k] === 'string' && b[k] !== '' ? (b[k] as string) : undefined;
  const num = (k: string): number | undefined =>
    typeof b[k] === 'number' && Number.isFinite(b[k]) ? (b[k] as number) : undefined;

  const serverCode = str('error');
  const code: CrateErrorCode = serverCode ?? codeForStatus(status);
  const reason = REASON[status] ?? 'HTTP Error';
  const teachingMessage = str('message');
  const base = serverCode ? `${status} ${reason} (${serverCode})` : `${status} ${reason}`;
  const message = (teachingMessage ? `${base}: ${teachingMessage}` : base)
    .replace(/\s{2,}/g, ' ')
    .trim();

  const bodyRetryAfter = num('retry_after_seconds');
  const retryAfter = retryAfterHeaderMs !== undefined ? retryAfterHeaderMs / 1000 : bodyRetryAfter;

  return new CrateAPIError(message, {
    code,
    status,
    retryable: isRetryableStatus(status),
    ...(str('hint') !== undefined ? { hint: str('hint') } : {}),
    ...(str('doc_url') !== undefined ? { docUrl: str('doc_url') } : {}),
    ...(str('next') !== undefined ? { next: str('next') } : {}),
    ...(str('param') !== undefined ? { param: str('param') } : {}),
    ...(Array.isArray(b.details) ? { details: b.details as unknown[] } : {}),
    ...(retryAfter !== undefined ? { retryAfter } : {}),
    ...(num('master_id') !== undefined ? { masterId: num('master_id') } : {}),
    ...(requestId !== undefined ? { requestId } : {}),
    ...(raw !== undefined ? { raw } : {}),
  });
}
