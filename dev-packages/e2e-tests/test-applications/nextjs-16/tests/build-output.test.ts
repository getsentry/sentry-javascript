import { expect, test } from '@playwright/test';
import { findAbsolutePathImports } from '@sentry-internal/test-utils';
import * as fs from 'fs';
import * as path from 'path';
import { isDevMode } from './isDevMode';
import { isVinext } from './isVinext';

test.skip(isVinext, 'Checks the build output of Next.js');

test('excludes dependency metadata while preserving application metadata', () => {
  test.skip(isDevMode || process.env.NEXT_PUBLIC_EXCLUDE_APPLICATION_KEY_DEPENDENCIES !== '1');

  const staticDir = path.join(process.cwd(), '.next', 'static');
  const chunks = fs
    .readdirSync(staticDir, { recursive: true })
    .filter(file => String(file).endsWith('.js'))
    .map(file => fs.readFileSync(path.join(staticDir, String(file)), 'utf8'));
  const dependencyChunks = chunks.filter(chunk => chunk.includes('application-key-dependency-error'));
  const applicationChunks = chunks.filter(chunk => chunk.includes('first-party-error'));

  expect(dependencyChunks.length).toBeGreaterThan(0);
  expect(applicationChunks.length).toBeGreaterThan(0);
  for (const chunk of dependencyChunks) {
    expect(chunk).not.toContain('_sentryBundlerPluginAppKey:nextjs-16-e2e');
  }
  for (const chunk of applicationChunks) {
    expect(chunk).toContain('_sentryBundlerPluginAppKey:nextjs-16-e2e');
  }
});

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
