import type { Plugin } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { makeCustomSentryVitePlugins } from '../../src/vite/makeCustomSentryVitePlugins';
import { sentryReactRouter } from '../../src/vite/plugin';

vi.spyOn(console, 'log').mockImplementation(() => {
  /* noop */
});
vi.spyOn(console, 'warn').mockImplementation(() => {
  /* noop */
});

vi.mock('../../src/vite/makeCustomSentryVitePlugins', () => ({
  makeCustomSentryVitePlugins: vi.fn().mockImplementation(async _options => {
    return [{ name: 'sentry-telemetry-plugin' }, { name: 'sentry-vite-release-injection-plugin' }];
  }),
}));

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

  it('passes release configuration to plugins', async () => {
    const releaseName = 'test-release';
    await getSentryReactRouterVitePlugins({
      release: {
        name: releaseName,
      },
    });

    expect(makeCustomSentryVitePlugins).toHaveBeenCalledWith(
      expect.objectContaining({
        release: {
          name: releaseName,
        },
      }),
    );
  });
});
