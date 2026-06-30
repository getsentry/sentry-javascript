import type { WebpackPluginInstance } from 'webpack';
import { sentryWebpackPlugin } from '../../src/webpack/index';
import { describe, it, expect, test } from 'vitest';

test('Webpack plugin should exist', () => {
  expect(sentryWebpackPlugin).toBeDefined();
  expect(typeof sentryWebpackPlugin).toBe('function');
});

describe('sentryWebpackPlugin', () => {
  it('returns a webpack plugin', () => {
    const plugin = sentryWebpackPlugin({
      authToken: 'test-token',
      org: 'test-org',
      project: 'test-project',
    }) as WebpackPluginInstance;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    expect(plugin).toEqual({ apply: expect.any(Function) });
  });
});
