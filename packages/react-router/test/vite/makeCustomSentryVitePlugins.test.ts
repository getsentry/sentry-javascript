import { sentryVitePlugin } from '@sentry/bundler-plugins/vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCustomSentryVitePlugins } from '../../src/vite/makeCustomSentryVitePlugins';

vi.mock('@sentry/bundler-plugins/vite', () => ({
  sentryVitePlugin: vi.fn().mockReturnValue([{ name: 'sentry-vite-plugin' }]),
}));

describe('makeCustomSentryVitePlugins', () => {
  beforeEach(() => {
    // Without this, `toHaveBeenCalledWith` can match a call made by an earlier test,
    // so assertions pass against stale arguments instead of their own.
    vi.clearAllMocks();
  });

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

  it('should pass applicationKey to sentryVitePlugin', async () => {
    await makeCustomSentryVitePlugins({
      applicationKey: 'my-app-key',
    });

    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationKey: 'my-app-key',
      }),
    );
  });

  it('should return all plugins from sentryVitePlugin', async () => {
    const plugins = await makeCustomSentryVitePlugins({});
    expect(plugins).toHaveLength(1);
    expect(plugins?.[0]?.name).toBe('sentry-vite-plugin');
  });

  it('should disable sourcemap upload by default', async () => {
    await makeCustomSentryVitePlugins({});

    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcemaps: expect.objectContaining({
          disable: true,
        }),
      }),
    );
  });

  // Regression test for https://github.com/getsentry/sentry-javascript/issues/22929.
  // `sentryOnBuildEnd` is the only place that injects debug IDs and uploads, so the Vite plugin must
  // stay disabled - otherwise every chunk gets a second debug ID with no artifact bundle behind it.
  // It must also never delete the maps, because its `writeBundle` deletes in a `finally` block that
  // runs even when `disable` is set, which would remove them before `sentryOnBuildEnd` uploads.
  // Neither may be changed by any user option.
  it('should keep sourcemaps disabled and filesToDeleteAfterUpload unset whatever the user configures', async () => {
    await makeCustomSentryVitePlugins({
      sourcemaps: {
        disable: false,
        assets: ['dist/**'],
        filesToDeleteAfterUpload: ['./build/**/*.map'],
      },
    });

    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcemaps: {
          disable: true,
          filesToDeleteAfterUpload: undefined,
        },
      }),
    );
  });

  // metaFramework identifies the SDK to Sentry telemetry, so it stays pinned.
  it('should always report react-router as the metaFramework', async () => {
    await makeCustomSentryVitePlugins({ org: 'my-org' });

    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        _metaOptions: {
          telemetry: {
            metaFramework: 'react-router',
          },
        },
      }),
    );
  });

  it('should pass reactComponentAnnotation through to sentryVitePlugin', async () => {
    await makeCustomSentryVitePlugins({
      reactComponentAnnotation: { enabled: true, ignoredComponents: ['MyComponent'] },
    });

    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        reactComponentAnnotation: { enabled: true, ignoredComponents: ['MyComponent'] },
      }),
    );
  });

  it('should pass moduleMetadata through to sentryVitePlugin', async () => {
    await makeCustomSentryVitePlugins({ moduleMetadata: { team: 'sdk' } });

    expect(sentryVitePlugin).toHaveBeenCalledWith(expect.objectContaining({ moduleMetadata: { team: 'sdk' } }));
  });

  // The plugin creates/finalizes the release in `writeBundle` even with `sourcemaps.disable: true`,
  // so a self-hosted instance has to be reachable from the Vite plugin, not just from `sentryOnBuildEnd`.
  it('should pass self-hosted and logging options through to sentryVitePlugin', async () => {
    const errorHandler = (): void => undefined;

    await makeCustomSentryVitePlugins({
      sentryUrl: 'https://my.sentry.io',
      headers: { 'X-My-Header': 'foo' },
      silent: true,
      errorHandler,
    });

    expect(sentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        // `sentryUrl` is spelled `url` on the plugin
        url: 'https://my.sentry.io',
        headers: { 'X-My-Header': 'foo' },
        silent: true,
        errorHandler,
      }),
    );
  });

  it('should warn when the removed `unstable_sentryVitePluginOptions` is still set', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // @ts-expect-error - removed in v11, but JS configs get no type checking
    await makeCustomSentryVitePlugins({ unstable_sentryVitePluginOptions: { org: 'other-org' } });

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('unstable_sentryVitePluginOptions'));

    consoleWarnSpy.mockRestore();
  });
});
