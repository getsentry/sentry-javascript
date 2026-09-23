import { expect, test } from '@playwright/test';
import { findAbsolutePathImports } from '@sentry-internal/test-utils';
import * as fs from 'fs';
import * as path from 'path';
import { isDevMode } from './isDevMode';

test('emits no absolute-path imports into the server output', () => {
  const leaks = findAbsolutePathImports({ outputDir: path.join(process.cwd(), '.next', 'server') });

  expect(leaks).toEqual([]);
});

// This app has no `pages` directory, so `withSentryConfig` lets the bundler drop the Pages Router navigation
// instrumentation and its `next/router` import (~80 KB raw).
test('does not ship the Pages Router runtime in the App Router client bundle', () => {
  test.skip(isDevMode, 'Only production builds are tree-shaken');

  const buildManifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.next', 'build-manifest.json'), 'utf8'));
  const rootMainFiles: string[] = buildManifest.rootMainFiles;
  expect(rootMainFiles.length).toBeGreaterThan(0);

  const appClientBundle = rootMainFiles
    .map(file => fs.readFileSync(path.join(process.cwd(), '.next', file), 'utf8'))
    .join('\n');

  // Control: the Sentry client is in these files.
  expect(appClientBundle).toContain('auto.pageload.nextjs.pages_router_instrumentation');

  expect(appClientBundle).not.toContain('auto.navigation.nextjs.pages_router_instrumentation');
  // Only Next.js' Pages Router runtime contains this event name.
  expect(appClientBundle).not.toContain('beforeHistoryChange');
});
