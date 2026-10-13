import { expect, test } from '@playwright/test';
import { findAbsolutePathImports } from '@sentry-internal/test-utils';
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

// Regression test for the bug this app surfaced (JS-3451): `register.ts` reaches the ESM loader
// hook through `Module.register(...)`, a runtime call `@vercel/nft` cannot trace. The hook was
// therefore never copied into the standalone output, and channel-based instrumentation failed to
// register, silently, behind `debug: true`. Asserting on the traced output rather than on emitted
// telemetry, because Next.js records its server spans through its own wrapping either way, so the
// tests in `standalone.test.ts` stay green even when channel injection is dead.
test('traces the orchestrion ESM loader hook into the standalone output', () => {
  const standaloneDir = path.join(process.cwd(), '.next', 'standalone');
  const hookSuffix = path.join('@sentry', 'server-runtime-injection', 'build', 'esm', 'hook.js');

  const found = fs
    .readdirSync(standaloneDir, { recursive: true, withFileTypes: true })
    .some(entry => entry.isFile() && path.join(entry.parentPath, entry.name).endsWith(hookSuffix));

  expect(found).toBe(true);
});
