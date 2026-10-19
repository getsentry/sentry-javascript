import { sentryEsbuildPlugin as nodeEsbuildPlugin } from '@sentry/node/esbuild';
import { sentryRollupPlugin as nodeRollupPlugin } from '@sentry/node/rollup';
import { sentryVitePlugin as nodeVitePlugin } from '@sentry/node/vite';
import { sentryWebpackPlugin as nodeWebpackPlugin } from '@sentry/node/webpack';
import { describe, expect, it } from 'vitest';
import { sentryEsbuildPlugin } from '../src/bundler-plugin/esbuild';
import { sentryRollupPlugin } from '../src/bundler-plugin/rollup';
import { sentryVitePlugin } from '../src/bundler-plugin/vite';
import { sentryWebpackPlugin } from '../src/bundler-plugin/webpack';

describe('@sentry/google-cloud-serverless bundler plugins', () => {
  it('re-exports the @sentry/node plugins', () => {
    expect(sentryVitePlugin).toBe(nodeVitePlugin);
    expect(sentryRollupPlugin).toBe(nodeRollupPlugin);
    expect(sentryWebpackPlugin).toBe(nodeWebpackPlugin);
    expect(sentryEsbuildPlugin).toBe(nodeEsbuildPlugin);
  });
});
