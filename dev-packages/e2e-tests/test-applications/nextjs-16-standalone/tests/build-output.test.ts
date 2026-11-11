import { expect, test } from '@playwright/test';
import { findAbsolutePathImports } from '@sentry-internal/test-utils';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const runtimeInjectionBuildDir = path.join('@sentry', 'server-runtime-injection', 'build');

function findStandaloneFile(suffix: string): string | undefined {
  const standaloneDir = path.join(process.cwd(), '.next', 'standalone');
  return fs
    .readdirSync(standaloneDir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => path.join(entry.parentPath, entry.name))
    .find(file => file.endsWith(suffix));
}

// `output: 'standalone'` is the mode where a baked-in absolute specifier actually bites: the server
// chunks are copied to `.next/standalone` and run from there, so anything resolving against the
// build machine's layout becomes MODULE_NOT_FOUND on the first request that reaches the chunk.
test('emits no absolute-path imports into the relocated standalone output', () => {
  const leaks = findAbsolutePathImports({
    outputDir: path.join(process.cwd(), '.next', 'standalone', '.next', 'server'),
  });

  expect(leaks).toEqual([]);
});

// Regression test for the bug this app surfaced (JS-3451): `register.ts` reaches the ESM loader
// hook through `Module.register(...)`, a runtime call `@vercel/nft` cannot trace. The hook was
// therefore never copied into the standalone output, and channel-based instrumentation failed to
// register, silently, behind `debug: true`. Asserting on the traced output rather than on emitted
// telemetry, because Next.js records its server spans through its own wrapping either way, so the
// tests in `standalone.test.ts` stay green even when channel injection is dead.
test('traces the orchestrion ESM loader hook into the standalone output', () => {
  expect(findStandaloneFile(path.join(runtimeInjectionBuildDir, 'esm', 'hook.js'))).toBeDefined();
});

// Regression test for JS-4067: Turbopack ships the hook without following its imports, so the
// standalone output must hold everything the hook needs. The runner's Node takes the
// `Module.registerHooks` path, which never loads the hook, so force the `Module.register()` path
// that Node < 24.13 takes.
test('registers the orchestrion ESM loader hook from the standalone output', () => {
  const registerPath = findStandaloneFile(path.join(runtimeInjectionBuildDir, 'cjs', 'register.js'));
  expect(registerPath).toBeDefined();

  const script = `
    require('node:module').registerHooks = undefined;
    require(${JSON.stringify(registerPath)}).registerDiagnosticsChannelInjection();
  `;
  const { stderr, status } = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });

  expect(stderr).not.toContain('Failed to register diagnostics-channel injection hooks');
  expect(status).toBe(0);
});
