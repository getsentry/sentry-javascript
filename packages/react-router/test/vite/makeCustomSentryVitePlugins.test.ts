import { sentryVitePlugin } from '@sentry/vite-plugin';
import { describe, expect, it, vi } from 'vitest';
import { makeCustomSentryVitePlugins } from '../../src/vite/makeCustomSentryVitePlugins';

vi.mock('@sentry/vite-plugin', () => ({
  sentryVitePlugin: vi
    .fn()
    .mockReturnValue([
      { name: 'sentry-telemetry-plugin' },
      { name: 'sentry-vite-release-injection-plugin' },
      { name: 'other-plugin' },
    ]),
}));

describe('makeCustomSentryVitePlugins', () => {
  it('should pass release configuration to sentryVitePlugin', async () => {
    const options = {
      release: {
        name: 'test-release',
      },
    };

    await makeCustomSentryVitePlugins(options);

    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        release: {
          name: 'test-release',
        },
      }),
    );
  });

  it('should merge release configuration with unstable_sentryVitePluginOptions', async () => {
    const options = {
      release: {
        name: 'test-release',
      },
      unstable_sentryVitePluginOptions: {
        release: {
          name: 'unstable-release',
        },
      },
    };

    await makeCustomSentryVitePlugins(options);

    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        release: {
          name: 'test-release',
        },
      }),
    );
  });

  it('should only return telemetry and release injection plugins', async () => {
    const plugins = await makeCustomSentryVitePlugins({});
    expect(plugins).toHaveLength(2);
    expect(plugins?.[0]?.name).toBe('sentry-telemetry-plugin');
    expect(plugins?.[1]?.name).toBe('sentry-vite-release-injection-plugin');
  });
});
