# Errors

Every failure throws a subclass of `CrateError`. You branch on a stable **`kind`** discriminant and
a machine-branchable **`code`** — never on the message. Client-side errors also carry a human
`hint` and a copy-pasteable `next`.

## The error kinds

| `kind`       | class                  | retryable             | key fields                                                         |
| ------------ | ---------------------- | --------------------- | ------------------------------------------------------------------ |
| `api`        | `CrateAPIError`        | iff `429/500/503/504` | `status`, `retryAfter`, `rateLimit`, `requestId`, `details`, `raw` |
| `network`    | `CrateNetworkError`    | yes                   | `cause`                                                            |
| `timeout`    | `CrateTimeoutError`    | yes                   | `timeoutMs`                                                        |
| `abort`      | `CrateAbortError`      | no                    | `cause`                                                            |
| `validation` | `CrateValidationError` | no                    | `code`, `hint`, `next`, `param`                                    |
| `not_found`  | `CrateNotFoundError`   | no                    | `hint`, `next`                                                     |
| `parse`      | `CrateParseError`      | no                    | `status`, `raw`                                                    |
| `pagination` | `CratePaginationError` | no                    | `lastCursor`, `hint`, `next`                                       |

`CRATE_ERROR_KINDS` and `CRATE_ERROR_CODES` are exported arrays; `CRATE_ERROR_REGISTRY` maps each
kind to `{ retryable, clientSide, carries, whenThrown }` so an agent can introspect without docs.

## HTTP status → kind

| Status        | Becomes                           | Notes                                                  |
| ------------- | --------------------------------- | ------------------------------------------------------ |
| `401`         | `validation` (`api_key_required`) | usually caught locally before the request              |
| `402`         | `api` (`payment_required`)        | key lacks access to the resource                       |
| `404`         | `not_found`                       | also the SDK's honest-gap path for unresolved locators |
| `429`         | `api` (`rate_limited`)            | `isRateLimited(err)` → `retryAfter` + `rateLimit`      |
| `5xx`         | `api` (retryable)                 | auto-retried within the deadline                       |
| (no response) | `network` / `timeout`             | transport failures                                     |

## The canonical catch

```ts
import { Crate, isCrateError, isRateLimited } from '@hosaka-fm/crate';

try {
  await crate.artist('Four Tet');
} catch (err) {
  if (!isCrateError(err)) throw err; // not ours — rethrow
  switch (err.kind) {
    case 'validation':
    case 'not_found':
    case 'pagination':
      console.error(`${err.code}: ${err.hint} → ${err.next}`);
      break;
    case 'api': // CrateAPIError
      console.error(`HTTP ${err.status} (${err.code}) req=${err.requestId}`);
      if (isRateLimited(err)) await wait(err.retryAfter); // SDK already backed off
      break;
    default:
      console.error(JSON.stringify(err));
  }
}
```

`switch (err.kind)` narrows the union: inside `case 'api'`, `err` is a `CrateAPIError` with
`.status` etc. Always log `err.requestId` (present on every `CrateAPIError`) when contacting support.

## Guards over `instanceof`

```ts
import { isCrateError, isCrateAPIError, isRateLimited, isRetryable } from '@hosaka-fm/crate';
```

Prefer the `isCrate*` guards. They both narrow the type **and** survive the ESM/CJS dual-package
boundary, where `instanceof` can see two distinct copies of a class and silently return `false`.
`isRetryable(err)` tells you whether the SDK's policy would retry; `isRateLimited(err)` narrows to a
`429` `CrateAPIError`.

## JSON-safe by design

```ts
log(JSON.stringify(err)); // a plain Error → "{}"; a CrateError → full teaching envelope
```

`CrateError.toJSON()` emits a stable `CrateErrorJSON` envelope (`name`, `kind`, `code`, `message`,
`status?`, `retryAfter?`, `requestId?`, `rateLimit?`, `hint?`, `next?`, …). It deliberately **omits**
`.raw` and reduces `.cause` to `{ name, message }`, so logs and agent-to-agent handoffs never leak
response bodies or headers. The `.raw` field stays on the live object as an escape hatch for fields
the SDK doesn't model.

## Honest gaps are not errors

A `200` with `present: false` / `cluster_id: null` / an empty list is an **honest gap**, surfaced as
`null` (or an empty array), not an exception. `crate.artistOrNull(...)` returns `null`, and
`crate.resolve(...)` returns a null `cluster_id`, in that case. Only `4xx`/`5xx` throw. Runnable:
[`examples/error-handling.ts`](../examples/error-handling.ts).
