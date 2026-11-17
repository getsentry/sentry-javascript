import { expect, test } from '@playwright/test';
import { findAbsolutePathImports } from '@sentry-internal/test-utils';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// `output: 'standalone'` is the mode where a baked-in absolute specifier actually bites: the server
// chunks are copied to `.next/standalone` and run from there, so anything resolving against the
// build machine's layout becomes MODULE_NOT_FOUND on the first request that reaches the chunk.
test('emits no absolute-path imports into the relocated standalone output', () => {
  const leaks = findAbsolutePathImports({
    outputDir: path.join(process.cwd(), '.next', 'standalone', '.next', 'server'),
  });

  expect(leaks).toEqual([]);
});

// Regression test for JS-3451 and JS-4067. `register.ts` hands the loader hook to
// `Module.register()` by runtime path, so the standalone output must ship the hook and everything it
// loads: first `@vercel/nft` didn't trace the hook at all, then Turbopack shipped it without its
// imports. Either way channel injection failed to register, silently, behind `debug: true`. This
// checks the registration marker rather than emitted telemetry, because Next.js records its server
// spans through its own wrapping either way. The runner's Node takes the `Module.registerHooks` path,
// which never loads the hook, so force the `Module.register()` path that Node < 24.13 takes.
test('registers the orchestrion loader hook from the standalone output', () => {
  const registerSuffix = path.join('@sentry', 'server-runtime-injection', 'build', 'cjs', 'register.js');
  const registerPath = fs
    .readdirSync(path.join(process.cwd(), '.next', 'standalone'), { recursive: true, withFileTypes: true })
    .map(entry => path.join(entry.parentPath, entry.name))
    .find(file => file.endsWith(registerSuffix));
  expect(registerPath).toBeDefined();

  const script = `
    require('node:module').registerHooks = undefined;
    require(${JSON.stringify(registerPath)}).registerDiagnosticsChannelInjection();
    const marker = globalThis.__SENTRY__?.__SENTRY_ORCHESTRION__ ?? globalThis.__SENTRY_ORCHESTRION__;
    process.stdout.write(JSON.stringify(marker));
  `;
  const { stdout, stderr } = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });

  expect(stderr).not.toContain('Failed to register diagnostics-channel injection hooks');
  expect(JSON.parse(stdout)).toEqual({ runtime: [] });
});
