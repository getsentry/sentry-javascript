import { sentryVitePlugin } from '@sentry/vite-plugin';
import { describe, expect, it, vi } from 'vitest';
import { makeCustomSentryVitePlugins } from '../../src/vite/makeCustomSentryVitePlugins';

vi.mock('@sentry/vite-plugin', () => ({
  sentryVitePlugin: vi.fn().mockReturnValue([{ name: 'sentry-vite-plugin' }]),
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

  it('should return all plugins from sentryVitePlugin', async () => {
    const plugins = await makeCustomSentryVitePlugins({});
    expect(plugins).toHaveLength(1);
    expect(plugins?.[0]?.name).toBe('sentry-vite-plugin');
  });

  it('should disable sourcemap upload with "disable-upload" by default', async () => {
    await makeCustomSentryVitePlugins({});

    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcemaps: expect.objectContaining({
          disable: 'disable-upload',
        }),
      }),
    );
  });

  it('should allow overriding sourcemaps via unstable_sentryVitePluginOptions', async () => {
    await makeCustomSentryVitePlugins({
      unstable_sentryVitePluginOptions: {
        sourcemaps: {
          assets: ['dist/**'],
        },
      },
    });

    // unstable_sentryVitePluginOptions is spread last, so it fully overrides sourcemaps
    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcemaps: {
          assets: ['dist/**'],
        },
      }),
    );
  });
});
