#!/usr/bin/env node
// Tier-2 staleness check (NETWORK; schedule-only — never gates PR CI).
// Fetch the live spec, canonicalize with the same JCS used to write meta.json,
// sha256, and compare. Exit 1 on drift so the scheduled workflow opens a regen
// issue; exit 2 on a transient fetch failure (so a flaky network ≠ a drift signal).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalize } from './jcs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const meta = JSON.parse(readFileSync(path.join(root, 'spec', 'meta.json'), 'utf8'));
const url = meta.spec_url ?? 'https://crate.hosaka.fm/api/v2/openapi.json';

let live;
try {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    process.stderr.write(`transient: fetch ${url} -> HTTP ${res.status}\n`);
    process.exit(2);
  }
  live = await res.json();
} catch (err) {
  process.stderr.write(`transient: fetch ${url} failed: ${err.message}\n`);
  process.exit(2);
}

const liveHash = createHash('sha256').update(canonicalize(live)).digest('hex');
if (liveHash === meta.spec_sha256_jcs) {
  process.stderr.write(`spec in sync (sha256(JCS)=${liveHash.slice(0, 12)}…)\n`);
  process.exit(0);
}
process.stderr.write(
  `SPEC DRIFT: vendored ${meta.spec_sha256_jcs.slice(0, 12)}… != live ${liveHash.slice(0, 12)}…\n` +
    'Run `npm run generate` against the updated spec and commit the result.\n',
);
process.exit(1);
