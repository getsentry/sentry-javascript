import { sentryWebpackPlugin as nodeWebpackPlugin } from '@sentry/node/webpack';
import { describe, expect, it } from 'vitest';
import { sentryWebpackPlugin } from '../src/bundler-plugin/webpack';

describe('@sentry/nestjs bundler plugin', () => {
  it('re-exports the @sentry/node webpack plugin', () => {
    expect(sentryWebpackPlugin).toBe(nodeWebpackPlugin);
  });
});
