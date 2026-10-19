import * as bundlerPlugins from '@sentry/bundler-plugins/esbuild';
import { describe, expect, it } from 'vitest';
import * as plugin from '../src/index';

describe('@sentry/esbuild-plugin', () => {
  it('re-exports @sentry/bundler-plugins/esbuild', () => {
    expect(plugin.sentryEsbuildPlugin).toBe(bundlerPlugins.sentryEsbuildPlugin);
    expect(Object.keys(plugin).sort()).toEqual(Object.keys(bundlerPlugins).sort());
  });

  it('re-exports the default export', () => {
    expect(plugin.default).toBe(bundlerPlugins.default);
  });
});
