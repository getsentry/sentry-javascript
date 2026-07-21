import { sentryEsbuildPlugin } from '../../src/esbuild';
import type { Plugin } from 'esbuild';
import { describe, it, expect, test } from 'vitest';

test('Esbuild plugin should exist', () => {
  expect(sentryEsbuildPlugin).toBeDefined();
  expect(typeof sentryEsbuildPlugin).toBe('function');
});

describe('sentryEsbuildPlugin', () => {
  it('returns an esbuild plugin', () => {
    const plugin = sentryEsbuildPlugin({
      authToken: 'test-token',
      org: 'test-org',
      project: 'test-project',
    }) as Plugin;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    expect(plugin).toEqual({ name: 'sentry-esbuild-plugin', setup: expect.any(Function) });
  });
});
