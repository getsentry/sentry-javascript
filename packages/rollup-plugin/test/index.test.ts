import * as bundlerPlugins from '@sentry/bundler-plugins/rollup';
import { describe, expect, it } from 'vitest';
import * as plugin from '../src/index';

describe('@sentry/rollup-plugin', () => {
  it('re-exports @sentry/bundler-plugins/rollup', () => {
    expect(plugin.sentryRollupPlugin).toBe(bundlerPlugins.sentryRollupPlugin);
    expect(Object.keys(plugin).sort()).toEqual(Object.keys(bundlerPlugins).sort());
  });
});
