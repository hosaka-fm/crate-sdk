---
title: Concepts
description: The cluster-first model — cluster_id, dossier, grain — and how crate thinks about music.
---

crate is **cluster-first**: the same artist across Discogs, MusicBrainz, and Bandcamp collapses
to one canonical `cluster_id`. The artist is the root; `master` and `bandcamp` are *dimensions*
of the artist dossier (`discography`, `bandcamp_emergence`, `bandcamp_tastemaker`), not separate
top-level resources.

- **`cluster_id`** — the prime key. Opaque string; never numericize it.
- **dossier** — the deep, multi-facet record for a grain.
- **grain** — artist / label / festival. The artist grain is the hub.

:::caution[Scaffold — generated section]
The individual concept pages (`/concepts/<term>`) are **generated from the spec's `x-concepts`
vendor extension** (15 entries), owned by the **crate API team**. Wiring this is a Phase 1 task,
gated on the spec **path-consistency check** — the spec's `x-concepts[].see` fields currently
reference `/api/v1` (and one removed `/dossier/master/{id}` path), which must be fixed upstream
before these pages render. See `grimoires/loa/proposals/crate-docs-site-architecture.md` §4.
:::
