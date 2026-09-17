import { describe, it, expect } from 'vitest';
import { sentryWebpackPlugin } from '../../src/webpack/index';
/* eslint-disable typescript/no-deprecated */
import { sentryWebpackPlugin as sentryWebpack5Plugin } from '../../src/webpack/webpack5';
/* eslint-enable typescript/no-deprecated */

describe('deprecated webpack5 entry point', () => {
  it('re-exports the same plugin as the webpack entry point', () => {
    expect(sentryWebpack5Plugin).toBe(sentryWebpackPlugin);
  });

  it('returns a webpack plugin', () => {
    const plugin = sentryWebpack5Plugin({
      authToken: 'test-token',
      org: 'test-org',
      project: 'test-project',
    });

    expect(plugin).toEqual({ apply: expect.any(Function) });
  });
});
