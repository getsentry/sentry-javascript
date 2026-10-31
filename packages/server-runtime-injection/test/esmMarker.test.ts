import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Deployments can drop `build/esm/package.json` (the only `"type": "module"` marker for the hook),
 * and Vercel runs Node with syntax detection disabled, so the loader thread then parses the hook as
 * CommonJS. Runs against the built files, so it needs the package built.
 *
 * The copy sits inside this package so `@sentry/*` still resolves from its `node_modules`.
 */
const copyDir = mkdtempSync(join(__dirname, '.esm-marker-'));
cpSync(join(__dirname, '..', 'build'), join(copyDir, 'build'), { recursive: true });
rmSync(join(copyDir, 'build', 'esm', 'package.json'));

afterAll(() => {
  rmSync(copyDir, { recursive: true, force: true });
});

describe('without the build/esm package.json marker', () => {
  it('registers the ESM loader hook', { timeout: 30_000 }, () => {
    // Removing `registerHooks` forces the `Module.register()` path, the one that loads the hook on
    // Node < 24.13, whatever Node version runs the test.
    const script = `
      require('node:module').registerHooks = undefined;
      const { registerDiagnosticsChannelInjection } = require(${JSON.stringify(join(copyDir, 'build', 'cjs', 'register.js'))});
      registerDiagnosticsChannelInjection();
      import('data:text/javascript,export default 1').then(() => {
        const marker = globalThis.__SENTRY__?.__SENTRY_ORCHESTRION__ ?? globalThis.__SENTRY_ORCHESTRION__;
        process.stdout.write(JSON.stringify(marker));
      });
    `;

    const { stdout, stderr } = spawnSync(process.execPath, ['--no-experimental-detect-module', '-e', script], {
      encoding: 'utf8',
    });

    expect(stderr).not.toContain('Failed to register diagnostics-channel injection hooks');
    expect(JSON.parse(stdout)).toEqual({ runtime: [] });
  });
});
