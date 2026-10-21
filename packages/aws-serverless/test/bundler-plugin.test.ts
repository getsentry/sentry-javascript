import { sentryEsbuildPlugin as nodeEsbuildPlugin } from '@sentry/node/esbuild';
import { describe, expect, it } from 'vitest';
import { sentryEsbuildPlugin } from '../src/bundler-plugin/esbuild';

describe('@sentry/aws-serverless bundler plugin', () => {
  it('re-exports the @sentry/node esbuild plugin', () => {
    expect(sentryEsbuildPlugin).toBe(nodeEsbuildPlugin);
  });
});
