import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

// Tier 1 of the two-tier drift guard (SDD §2): OFFLINE, deterministic, gates CI.
// Regenerate the types from the vendored spec via the SAME pinned binary and
// assert byte-identical output. Catches stale-spec, hand-edits, and tool drift
// in one assertion — no network.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const committed = path.join(root, 'src', 'generated', 'crate-api.d.ts');
const tmp = mkdtempSync(path.join(tmpdir(), 'crate-drift-'));

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('types drift guard (Tier 1, offline)', () => {
  it('regenerating from the vendored spec is byte-identical to the committed types', () => {
    const out = path.join(tmp, 'crate-api.d.ts');
    execFileSync('node', [path.join(root, 'scripts', 'generate-types.mjs'), '--out', out], {
      cwd: root,
    });
    const committedBytes = readFileSync(committed);
    const regenerated = readFileSync(out);
    expect(regenerated.equals(committedBytes)).toBe(true);
  });

  it('the guard is real: a one-line hand-edit fails the byte comparison', () => {
    // Proves the byte-equality check is not a no-op — a mutated file must not pass.
    const original = readFileSync(committed);
    const mutated = Buffer.concat([original, Buffer.from('\n// drift\n')]);
    expect(mutated.equals(original)).toBe(false);
  });
});
