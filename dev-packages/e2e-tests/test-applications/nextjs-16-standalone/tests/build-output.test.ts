import { expect, test } from '@playwright/test';
import { findAbsolutePathImports } from '@sentry-internal/test-utils';
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
