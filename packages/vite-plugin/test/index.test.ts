import * as bundlerPlugins from '@sentry/bundler-plugins/vite';
import { describe, expect, it } from 'vitest';
import * as plugin from '../src/index';

describe('@sentry/vite-plugin', () => {
  it('re-exports @sentry/bundler-plugins/vite', () => {
    expect(plugin.sentryVitePlugin).toBe(bundlerPlugins.sentryVitePlugin);
    expect(Object.keys(plugin).sort()).toEqual(Object.keys(bundlerPlugins).sort());
  });
});
