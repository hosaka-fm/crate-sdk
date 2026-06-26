# @hosaka-fm/crate documentation

Guides for the official typed TypeScript client for the [crate](https://crate.0xhoneyjar.xyz)
public API. New here? Start with the [README](../README.md) for install + quick start, then dive in:

| Guide                                   | What it covers                                                 |
| --------------------------------------- | -------------------------------------------------------------- |
| [Getting started](./getting-started.md) | Prerequisites, install, your first call in 60 seconds          |
| [Authentication](./authentication.md)   | The three auth tiers (anon / API key / beacon)                 |
| [Configuration](./configuration.md)     | Retries, timeouts, deadlines, custom `fetch`                   |
| [Pagination](./pagination.md)           | `bulkAll` async iterator, `pages()`, resume                    |
| [Errors](./errors.md)                   | Typed exceptions, `kind`/`code`, the HTTP-status map, `toJSON` |
| [AI agents](./ai-agents.md)             | Forgiving inputs, branch-on-code, runtime discovery            |
| [Recipes](./recipes.md)                 | Copy-paste, single-capability snippets                         |

**API reference.** The canonical reference is the **bundled TSDoc** — your editor surfaces it on
hover and go-to-definition for every method, option, and error (the `.d.ts` ships with the
package, so no lookup leaves your editor). For a browsable HTML copy, generate it on demand:

```sh
npm run docs:api   # runs typedoc (via npx) → docs/api/
```

Every snippet in these guides mirrors a type-checked file in [`examples/`](../examples), so the
docs can't drift from the real API.
