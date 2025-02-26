import type { Plugin } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { sentryReactRouter } from '../../src/vite/plugin';

vi.spyOn(console, 'log').mockImplementation(() => {
  /* noop */
});
vi.spyOn(console, 'warn').mockImplementation(() => {
  /* noop */
});

async function getSentryReactRouterVitePlugins(options?: Parameters<typeof sentryReactRouter>[0]): Promise<Plugin[]> {
  return sentryReactRouter(
    {
      project: 'project',
      org: 'org',
      authToken: 'token',
      ...options,
    },
    {
      command: 'build',
      mode: 'production',
    },
  );
}

describe('sentryReactRouter()', () => {
  it('returns an array of vite plugins', async () => {
    const plugins = await getSentryReactRouterVitePlugins();
    expect(plugins).toBeDefined();
    const names = plugins.map(plugin => plugin.name);
    expect(names).toEqual([
      'sentry-react-router-update-source-map-setting',
      'sentry-telemetry-plugin',
      'sentry-vite-release-injection-plugin',
    ]);
  });
});
