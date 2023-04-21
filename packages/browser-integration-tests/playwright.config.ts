import { defineConfig, devices } from '@playwright/test';
import { SentryTestFixtures } from './utils/fixtures';

const bundles = [
  'esm',
  'cjs',
  'bundle_es5',
  'bundle_es5_min',
  'bundle_es6',
  'bundle_es6_min',
  'bundle_replay_es6',
  'bundle_replay_es6_min',
  'bundle_tracing_es5',
  'bundle_tracing_es5_min',
  'bundle_tracing_es6',
  'bundle_tracing_es6_min',
  'bundle_tracing_replay_es6',
  'bundle_tracing_replay_es6_min',
];

const loaderBundles = [
  'loader_base',
  'loader_eager',
  'loader_debug',
  'loader_tracing',
  'loader_replay',
  'loader_tracing_replay',
];

const browsers = ['Desktop Chrome', 'Desktop Firefox', 'Desktop Safari'] as const;

export default defineConfig<SentryTestFixtures>({
  projects: browsers
    .map(browser => [
      ...bundles.map(bundle => ({ name: browser, use: { bundle, ...devices[browser] }, testDir: './suites' })),
      ...loaderBundles.map(bundle => ({
        name: browser,
        use: { bundle, ...devices[browser] },
        testDir: './loader-suites',
      })),
    ])
    .flat(),
  retries: 0,

  // Run tests inside of a single file in parallel
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
});
