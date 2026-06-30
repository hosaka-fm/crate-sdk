---
title: SDK reference
description: Every Crate method — signature, params, returns, auth tier, and a worked example.
---

The SDK surface is 8 public methods plus the `dossier`, `tastemakers`, and `searchEvents`
namespaces. Each is key-first except `index()`.

```ts
crate.resolve(query); // any link / name / id → a canonical cluster_id
crate.artist(key); // the full artist dossier (+ artistOrNull; + { fields } to trim)
crate.label(key); // the full label dossier (cluster-first)
crate.search(params); // faceted catalogue search · crate.facets() · crate.breakouts()
crate.tastemakers(); // callable + .onesToWatch()
crate.index(); // the keyless, self-describing root
```

:::note[Scaffold — generated section]
The per-method pages (`/sdk/<method>`) are **generated from `meta/surface.json`** — itself
extracted from the method TSDoc on `src/client.ts` by `scripts/extract-surface.mjs` and
drift-guarded by a method↔resource bijection check. Emitting the MDX pages (an extension of
`scripts/gen-docs.mjs`) is a Phase 1 task. The existing interactive **explorer**
(`explorer/index.html`) embeds at `/explorer`. Reference is never hand-authored.
:::
