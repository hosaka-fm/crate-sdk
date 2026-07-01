import { defineConfig } from 'tsup';

// Dual ESM + CJS, zero runtime deps. tsup (esbuild) is a devDependency only.
// Emits dist/index.js (ESM) + dist/index.cjs (CJS) + index.d.ts + index.d.cts,
// wired per the package.json `exports` conditions; @arethetypeswrong/cli-clean.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: false,
  minify: false,
  treeshake: true,
  target: 'node18',
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
});
