import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { isDevMode } from './isDevMode';

// Nitro v3 bundles every dependency, including the SDK's copy of `@sentry/server-runtime-injection`.
// On Node versions without `Module.registerHooks` (< 24.13), that bundled copy registers its ESM
// loader hook through the `@sentry/server-runtime-injection/hook` specifier, which has to resolve
// from the server output. The runner's Node takes the `registerHooks` path, so assert the
// resolution directly instead of the missing warning.
test('keeps the runtime injection loader hook resolvable from the server output', () => {
  test.skip(isDevMode, 'nuxt dev has no server output');

  const resolved = execFileSync(
    'node',
    ['--input-type=module', '-e', "console.log(import.meta.resolve('@sentry/server-runtime-injection/hook'))"],
    { cwd: '.output/server', encoding: 'utf8' },
  );

  expect(resolved.trim()).toMatch(/\/\.output\/server\/node_modules\/@sentry\/server-runtime-injection\/.*hook\.js$/);
});
