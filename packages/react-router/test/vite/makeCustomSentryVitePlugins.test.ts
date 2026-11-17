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

  // Release creation runs in the plugin's `writeBundle`, so these have to reach the plugin too.
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

  describe('with `releaseAtRuntime`', () => {
    type Hook = (this: unknown, ...args: unknown[]) => unknown;
    type PluginHooks = {
      configResolved: Hook;
      renderChunk: Hook;
      generateBundle: { order: string; handler: Hook };
    };

    function mockPluginPerConsumer() {
      const renderChunk = { client: vi.fn(), server: vi.fn() };
      const generateBundle = { client: vi.fn(), server: vi.fn() };
      vi.mocked(sentryVitePlugin).mockImplementation(options => {
        const consumer = options?.release?.inject === false ? 'client' : 'server';
        return [
          {
            name: 'sentry-vite-plugin',
            enforce: 'pre',
            renderChunk: renderChunk[consumer],
            generateBundle: { order: 'pre', handler: generateBundle[consumer] },
          },
        ];
      });
      return { renderChunk, generateBundle };
    }

    function environment(consumer: string) {
      return { environment: { config: { consumer } } };
    }

    it('turns off release injection for the client build only', async () => {
      await makeCustomSentryVitePlugins({ release: { name: 'v1' } }, { releaseAtRuntime: true });

      expect(sentryVitePlugin).toHaveBeenCalledTimes(2);
      expect(sentryVitePlugin).toHaveBeenCalledWith(
        expect.objectContaining({ release: { name: 'v1', inject: false } }),
      );
      expect(sentryVitePlugin).toHaveBeenCalledWith(expect.objectContaining({ release: { name: 'v1' } }));
    });

    it.each(['client', 'server'] as const)('runs only the %s plugin in the %s environment', async consumer => {
      const hooks = mockPluginPerConsumer();
      const other = consumer === 'client' ? 'server' : 'client';
      const plugins = (await makeCustomSentryVitePlugins({}, { releaseAtRuntime: true })) as unknown as PluginHooks[];

      for (const plugin of plugins) {
        plugin.configResolved.call(undefined, { build: {} });
        plugin.renderChunk.call(environment(consumer), 'code');
        plugin.generateBundle.handler.call(environment(consumer));
      }

      expect(hooks.renderChunk[consumer]).toHaveBeenCalledWith('code');
      expect(hooks.renderChunk[other]).not.toHaveBeenCalled();
      expect(hooks.generateBundle[consumer]).toHaveBeenCalledTimes(1);
      expect(hooks.generateBundle[other]).not.toHaveBeenCalled();
    });

    it.each([
      [false, 'client'],
      [true, 'server'],
    ] as const)('uses `build.ssr: %s` on Vite 5, which has no environments', async (ssr, consumer) => {
      const hooks = mockPluginPerConsumer();
      const other = consumer === 'client' ? 'server' : 'client';
      const plugins = (await makeCustomSentryVitePlugins({}, { releaseAtRuntime: true })) as unknown as PluginHooks[];

      for (const plugin of plugins) {
        plugin.configResolved.call(undefined, { build: { ssr } });
        plugin.renderChunk.call({}, 'code');
      }

      expect(hooks.renderChunk[consumer]).toHaveBeenCalledTimes(1);
      expect(hooks.renderChunk[other]).not.toHaveBeenCalled();
    });
  });
});
