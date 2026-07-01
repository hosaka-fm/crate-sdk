# Configuration & reliability

## Constructor options (`CrateOptions`)

```ts
const crate = new Crate({
  apiKey: process.env.CRATE_API_KEY,
  baseUrl: 'https://crate.hosaka.fm',
  timeout: 30_000,
  maxRetries: 2,
  maxBackoffMs: 8_000,
  maxRetryAfterMs: 60_000,
  totalDeadlineMs: 120_000,
  headers: { 'x-trace': 'demo' },
});
```

| Option            | Type                    | Default                   | Meaning                                                    |
| ----------------- | ----------------------- | ------------------------- | ---------------------------------------------------------- |
| `apiKey`          | `string`                | —                         | Customer key → `X-API-Key`. Required for data endpoints.   |
| `baseUrl`         | `string`                | `https://crate.hosaka.fm` | API origin (no path).                                      |
| `fetch`           | `typeof fetch`          | global `fetch`            | Injectable fetch (tests / custom agents / older runtimes). |
| `timeout`         | `number`                | `30000`                   | Per-attempt timeout, ms.                                   |
| `maxRetries`      | `number`                | `2`                       | Retries, **not** total sends. `0` disables.                |
| `maxBackoffMs`    | `number`                | `8000`                    | Full-jitter backoff cap, ms.                               |
| `maxRetryAfterMs` | `number`                | `60000`                   | Clamp on a server-directed `Retry-After`, ms.              |
| `totalDeadlineMs` | `number \| null`        | `120000`                  | Whole-call budget across retries, ms. `null` disables.     |
| `headers`         | `Record<string,string>` | —                         | Extra default headers (merged **under** SDK-managed ones). |

## Per-call overrides (`RequestOptions`)

Every method takes an optional final argument that overrides the retry/timeout knobs for that call
and adds an `AbortSignal`:

```ts
const ac = new AbortController();
await crate.search({ q: 'jungle' }, { signal: ac.signal, timeout: 5_000, maxRetries: 0 });
```

`signal`, `timeout`, `maxRetries`, `maxBackoffMs`, `maxRetryAfterMs`, `totalDeadlineMs`, `headers`.

## The reliability model

- **What retries:** only HTTP `429`, `500`, `503`, `504`, plus transport `network`/`timeout`
  failures. `4xx` (other than `429`), `validation`, `not_found`, `parse`, and caller `abort` never retry.
- **Backoff:** exponential with **full jitter**, capped at `maxBackoffMs`.
- **`Retry-After`:** honoured when crate sends it, clamped by `maxRetryAfterMs`.
- **Deadline:** `totalDeadlineMs` bounds the whole call (all attempts + backoff). Exceeding it
  raises `CrateTimeoutError`.
- **Idempotency:** all read methods are safe to retry.
- **Don't double-retry.** Because the SDK already retries, wrapping calls in your own retry loop
  multiplies the wait. On a `429`, read `err.retryAfter` / `err.rateLimit` instead.

## Cancellation vs. timeout

```ts
const ac = new AbortController();
const p = crate.search({ q: 'jungle' }, { signal: ac.signal });
ac.abort(); // → CrateAbortError (caller-initiated, NEVER retried)
```

A deadline/per-attempt timeout raises `CrateTimeoutError` (retried within the budget). The two are
distinct kinds so you can tell "I cancelled it" apart from "it was slow." Runnable:
[`examples/cancellation.ts`](../examples/cancellation.ts).

## Custom transport

Pass your own `fetch` to support older runtimes, inject a proxy/agent, or stub the network in tests:

```ts
import { Crate } from '@hosaka-fm/crate';
const crate = new Crate({ apiKey, fetch: myFetch });
```
