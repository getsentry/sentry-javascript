import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Build tracers can ship the loader hook without the files it imports (Turbopack does), and
 * deployments can drop `build/esm/package.json`. The CJS build must therefore register a hook that
 * needs nothing from `build/esm`. Runs against the built files, so it needs the package built.
 *
 * The copy sits inside this package so `@sentry/*` still resolves from its `node_modules`. It has
 * its own `package.json` so the `@sentry/server-runtime-injection/hook` fallback resolves to the
 * copy and not to the real build.
 */
const packageDir = join(__dirname, '..');
const copyDir = mkdtempSync(join(__dirname, '.cjs-only-'));
cpSync(join(packageDir, 'package.json'), join(copyDir, 'package.json'));
cpSync(join(packageDir, 'build', 'cjs'), join(copyDir, 'build', 'cjs'), { recursive: true });

afterAll(() => {
  rmSync(copyDir, { recursive: true, force: true });
});

describe('when a deployment ships only the CJS build', () => {
  it('registers the loader hook', { timeout: 30_000 }, () => {
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
