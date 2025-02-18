import type { Plugin } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { sentryReactRouter } from '../../src/vite/plugin';

vi.spyOn(console, 'log').mockImplementation(() => {
  /* noop */
});
vi.spyOn(console, 'warn').mockImplementation(() => {
  /* noop */
});

function getSentryReactRouterVitePlugins(options?: Parameters<typeof sentryReactRouter>[0]): Plugin[] {
  return sentryReactRouter(
    {
      project: 'project',
      org: 'org',
      authToken: 'token',
      ...options,
    },
    {},
  );
}

describe('sentryReactRouter()', () => {
  it('returns an array of vite plugins', () => {
    const plugins = getSentryReactRouterVitePlugins();
    const names = plugins.map(plugin => plugin.name);
    expect(names).toEqual([
      'sentry-telemetry-plugin',
      'sentry-vite-release-injection-plugin',
      'sentry-release-management-plugin',
      'sentry-vite-debug-id-injection-plugin',
      'sentry-vite-debug-id-upload-plugin',
      'sentry-file-deletion-plugin',
      'sentry-react-router-update-source-map-setting',
    ]);
  });
});
