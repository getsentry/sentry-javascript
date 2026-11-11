import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { build } from 'esbuild';
import { describe, expect, test } from 'vitest';

describe('esbuild bundling', () => {
  test('@sentry/node loads when bundled to CommonJS with esbuild', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'sentry-esbuild-cjs-'));
    const outfile = join(outDir, 'bundle.cjs');

    try {
      await build({
        entryPoints: [join(__dirname, 'app.ts')],
        outfile,
        platform: 'node',
        format: 'cjs',
        bundle: true,
        logLevel: 'silent',
      });

      const result = spawnSync('node', [outfile], { encoding: 'utf-8' });

      // The specific failure signature this guards against.
      expect(result.stderr).not.toContain('ERR_INVALID_ARG_VALUE');
      expect(result.stderr).not.toContain('createRequire');
      // The bundle loaded and ran to completion.
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('SENTRY_NODE_LOADED');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  test('@sentry/node survives init() when bundled to ESM with tree-shaking', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'sentry-esbuild-esm-'));
    const outfile = join(outDir, 'bundle.mjs');

    try {
      await build({
        entryPoints: [join(__dirname, 'app-init.ts')],
        outfile,
        platform: 'node',
        format: 'esm',
        bundle: true,
        // `@sentry/server-utils` is `sideEffects: false`, so this is where a bundler is free to
        // drop the vendored orchestrion transformer.
        treeShaking: true,
        logLevel: 'silent',
      });

      const result = spawnSync('node', [outfile], { encoding: 'utf-8' });

      // Dropping the transformer must not take `init()` with it: reading a tree-shaken CJS
      // container has to yield `undefined`, not throw on destructuring or on a call.
      expect(result.stderr).not.toContain('Cannot destructure');
      expect(result.stderr).not.toContain('is not a function');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('SENTRY_NODE_INITIALIZED client=true');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
