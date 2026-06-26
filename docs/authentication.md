# Authentication

crate has three auth tiers. The SDK enforces them **locally** so you fail fast with a typed error
instead of a confusing runtime `401`.

| Tier           | How you supply it                             | What it unlocks                            |
| -------------- | --------------------------------------------- | ------------------------------------------ |
| **Anonymous**  | nothing                                       | only `crate.index()`                       |
| **API key**    | `new Crate({ apiKey })` → sent as `X-API-Key` | every data endpoint                        |
| **Beacon JWT** | `{ beaconToken }` in the per-call options     | `crate.searchEvents.observed` / `.refined` |

## API key

```ts
const crate = new Crate({ apiKey: process.env.CRATE_API_KEY });
```

The key is sent on every request as the `X-API-Key` header. If you call a data method on a client
built **without** an `apiKey`, the SDK throws **before any network call**:

```ts
const anon = new Crate();
await anon.search({ q: 'jungle' });
// → CrateValidationError { code: 'api_key_required', hint: '…', next: 'new Crate({ apiKey })' }
```

This is a feature: a missing key is a programming error, caught instantly and locally, not a wasted
round-trip that returns `401`. Only `crate.index()` is exempt (it's the keyless discovery root).

### Where to keep the key

- Use an environment variable (`CRATE_API_KEY`) or a secret manager — **never hard-code or commit**
  a key. See [SECURITY.md](../SECURITY.md).
- **Server-side only by default.** A browser bundle would expose your key to end users. Use the SDK
  from a server, an edge function, or a backend proxy.

## Beacon token

`crate.searchEvents.observed(...)` and `.refined(...)` report search telemetry and require a
short-lived, per-search beacon JWT (issued alongside a search response), passed per call:

```ts
await crate.searchEvents.observed(
  { search_event_id: id, source: 'swr-cache-hit' },
  { beaconToken },
);
```

Missing the token throws `CrateValidationError('beacon_token_required')`. The beacon token is
distinct from your API key and is bound to a single `search_event_id`.

## Getting a key

Keys are operator-issued (invite-only) today; a self-serve tier lands later. See the
[crate docs](https://crate.0xhoneyjar.xyz/docs).
