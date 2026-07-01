import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The headline dual-package guarantee (SDD §7 / ADX): a CrateError thrown by the
// CJS build must be recognized by the ESM build's guards and vice versa — which
// `instanceof` would fail (two class identities) but the Symbol.for brand survives.
// Requires `npm run build` first (CI builds before test); skips cleanly otherwise.
const esmUrl = new URL('../dist/index.js', import.meta.url);
const cjsPath = fileURLToPath(new URL('../dist/index.cjs', import.meta.url));
const built = existsSync(fileURLToPath(esmUrl)) && existsSync(cjsPath);

describe.skipIf(!built)('dual-package brand survives ESM↔CJS', () => {
  it('each build’s guards recognize the other build’s error instances', async () => {
    const require = createRequire(import.meta.url);
    const cjs = require(cjsPath);
    const esm = await import(esmUrl.href);

    const fromCjs = new cjs.CrateValidationError('x', {
      code: 'exactly_one_of',
      hint: 'h',
      next: 'n',
    });
    expect(esm.isCrateError(fromCjs)).toBe(true);
    expect(esm.isCrateValidationError(fromCjs)).toBe(true);
    expect(esm.isRetryable(new cjs.CrateNetworkError('net'))).toBe(true);

    const fromEsm = new esm.CrateNotFoundError('y', { hint: 'h', next: 'n' });
    expect(cjs.isCrateError(fromEsm)).toBe(true);
    expect(cjs.isCrateNotFoundError(fromEsm)).toBe(true);

    // toJSON is stable + JSON-safe across the boundary
    expect(JSON.parse(JSON.stringify(fromCjs)).code).toBe('exactly_one_of');
  });
});
