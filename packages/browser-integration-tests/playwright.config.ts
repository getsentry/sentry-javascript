import { defineConfig } from '@playwright/test';
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

export default defineConfig<SentryTestFixtures>({
  projects: [
    ...bundles.map(bundle => ({ use: { bundle }, testDir: './suites' })),
    ...loaderBundles.map(bundle => ({ use: { bundle }, testDir: './loader-suites' })),
  ],
  retries: 0,

  // Run tests inside of a single file in parallel
  fullyParallel: true,

  // Use 3 workers on CI, else use defaults (based on available CPU cores)
  // Note that 3 is a random number selected to work well with our CI setup
  workers: process.env.CI ? 3 : undefined,
});
