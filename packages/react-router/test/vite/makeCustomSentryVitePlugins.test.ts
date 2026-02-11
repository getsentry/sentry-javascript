import { sentryVitePlugin } from '@sentry/vite-plugin';
import { describe, expect, it, vi } from 'vitest';
import { makeCustomSentryVitePlugins } from '../../src/vite/makeCustomSentryVitePlugins';

vi.mock('@sentry/vite-plugin', () => ({
  sentryVitePlugin: vi
    .fn()
    .mockReturnValue([
      { name: 'sentry-telemetry-plugin' },
      { name: 'sentry-vite-injection-plugin' },
      { name: 'sentry-vite-component-name-annotate-plugin' },
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
    expect(plugins?.[1]?.name).toBe('sentry-vite-injection-plugin');
  });

  it('should include component annotation plugin when reactComponentAnnotation.enabled is true', async () => {
    const plugins = await makeCustomSentryVitePlugins({ reactComponentAnnotation: { enabled: true } });

    expect(plugins).toHaveLength(3);
    expect(plugins?.[0]?.name).toBe('sentry-telemetry-plugin');
    expect(plugins?.[1]?.name).toBe('sentry-vite-injection-plugin');
    expect(plugins?.[2]?.name).toBe('sentry-vite-component-name-annotate-plugin');
  });

  it('should include component annotation plugin when unstable_sentryVitePluginOptions.reactComponentAnnotation.enabled is true', async () => {
    const plugins = await makeCustomSentryVitePlugins({
      unstable_sentryVitePluginOptions: { reactComponentAnnotation: { enabled: true } },
    });

    expect(plugins).toHaveLength(3);
    expect(plugins?.[0]?.name).toBe('sentry-telemetry-plugin');
    expect(plugins?.[1]?.name).toBe('sentry-vite-injection-plugin');
    expect(plugins?.[2]?.name).toBe('sentry-vite-component-name-annotate-plugin');
  });
});
