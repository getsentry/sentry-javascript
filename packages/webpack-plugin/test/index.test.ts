import * as bundlerPlugins from '@sentry/bundler-plugins/webpack';
import { describe, expect, it } from 'vitest';
import * as plugin from '../src/index';

describe('@sentry/webpack-plugin', () => {
  it('re-exports @sentry/bundler-plugins/webpack', () => {
    expect(plugin.sentryWebpackPlugin).toBe(bundlerPlugins.sentryWebpackPlugin);
    expect(Object.keys(plugin).sort()).toEqual(Object.keys(bundlerPlugins).sort());
  });

  it('re-exports the plugin from ./webpack5', async () => {
    const webpack5 = await import('../src/webpack5');
    expect(webpack5.sentryWebpackPlugin).toBe(bundlerPlugins.sentryWebpackPlugin);
  });
});
