import type { SentryVitePluginOptions } from '@sentry/bundler-plugins/vite';
import type { Plugin, UserConfig } from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sentrySolidStart } from '../../src/vite/sentrySolidStart';
import {
  getUpdatedSourceMapSettings,
  makeAddSentryVitePlugin,
  makeAddSentryVitePluginSolidStart2,
  makeEnableSourceMapsVitePlugin,
} from '../../src/vite/sourceMaps';

const mockedSentryVitePlugin = {
  name: 'sentry-vite-debug-id-upload-plugin',
  writeBundle: vi.fn(),
};

// Captured so tests can await the deferred `filesToDeleteAfterUpload` promise, which
// `toHaveBeenCalledWith` can only match by identity.
let lastPluginOptions: SentryVitePluginOptions | undefined;

const sentryVitePluginSpy = vi.fn((options: SentryVitePluginOptions) => {
  lastPluginOptions = options;
  return [mockedSentryVitePlugin];
});

/** Runs a plugin's `config` hook the way Vite does. */
function runConfigHook(plugin: Plugin, config: UserConfig = {}): void {
  const hook = plugin.config;
  const handler = typeof hook === 'function' ? hook : hook?.handler;
  handler?.call({} as never, config, { command: 'build', mode: 'production' });
}

vi.mock('@sentry/bundler-plugins/vite', async () => {
  const original = (await vi.importActual('@sentry/bundler-plugins/vite')) as any;

  return {
    ...original,
    sentryVitePlugin: (options: SentryVitePluginOptions) => sentryVitePluginSpy(options),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('makeSourceMapsVitePlugin()', () => {
  it('returns a plugin to set `sourcemaps` to `true`', () => {
    const sourceMapsConfigPlugins = makeEnableSourceMapsVitePlugin({});
    const enableSourceMapPlugin = sourceMapsConfigPlugins[0];

    expect(enableSourceMapPlugin?.name).toEqual('sentry-solidstart-update-source-map-setting');
    expect(enableSourceMapPlugin?.apply).toEqual('build');
    expect(enableSourceMapPlugin?.enforce).toEqual('post');
    expect(enableSourceMapPlugin?.config).toEqual(expect.any(Function));

    expect(sourceMapsConfigPlugins).toHaveLength(1);
  });

  // Vite concatenates arrays when merging, so echoing the config back duplicates the user's arrays.
  it('contributes only the source map setting, not the whole config back', () => {
    const plugin = makeEnableSourceMapsVitePlugin({})[0]!;
    const hook = plugin.config;
    const handler = typeof hook === 'function' ? hook : hook?.handler;

    const contributed = handler?.call(
      {} as never,
      { optimizeDeps: { include: ['x'] } },
      {
        command: 'build',
        mode: 'production',
      },
    );

    expect(contributed).toEqual({ build: { sourcemap: 'hidden' } });
  });
});

describe('makeAddSentryVitePlugin()', () => {
  it('passes user-specified vite plugin options to vite plugin', () => {
    makeAddSentryVitePlugin(
      {
        org: 'my-org',
        authToken: 'my-token',
        applicationKey: 'my-app-key',
        sentryUrl: 'https://my.sentry.io',
        moduleMetadata: { team: 'sdk' },
        sourcemaps: {
          filesToDeleteAfterUpload: ['baz/*.js'],
        },
        bundleSizeOptimizations: {
          excludeTracing: true,
        },
      },
      {},
    );

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        org: 'my-org',
        authToken: 'my-token',
        applicationKey: 'my-app-key',
        // `sentryUrl` is resolved to the plugin's `url` option
        url: 'https://my.sentry.io',
        moduleMetadata: { team: 'sdk' },
        sourcemaps: {
          filesToDeleteAfterUpload: ['baz/*.js'],
        },
        bundleSizeOptimizations: {
          excludeTracing: true,
        },
      }),
    );
  });

  it('should update `filesToDeleteAfterUpload` if source map generation was previously not defined', () => {
    makeAddSentryVitePlugin(
      {
        org: 'my-org',
        authToken: 'my-token',
        bundleSizeOptimizations: {
          excludeTracing: true,
        },
      },
      {},
    );

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcemaps: expect.objectContaining({
          filesToDeleteAfterUpload: ['.*/**/*.map'],
        }),
      }),
    );
  });

  it('should not update `filesToDeleteAfterUpload` if source map generation was previously enabled', () => {
    makeAddSentryVitePlugin(
      {
        org: 'my-org',
        authToken: 'my-token',
        bundleSizeOptimizations: {
          excludeTracing: true,
        },
      },
      { build: { sourcemap: true } },
    );

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcemaps: expect.objectContaining({
          filesToDeleteAfterUpload: undefined,
        }),
      }),
    );
  });

  it('should not update `filesToDeleteAfterUpload` if source map generation was previously disabled', () => {
    makeAddSentryVitePlugin(
      {
        org: 'my-org',
        authToken: 'my-token',
        bundleSizeOptimizations: {
          excludeTracing: true,
        },
      },
      { build: { sourcemap: false } },
    );

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcemaps: expect.objectContaining({
          filesToDeleteAfterUpload: undefined,
        }),
      }),
    );
  });
});

describe('makeAddSentryVitePluginSolidStart2()', () => {
  it('passes the shared build-time options through to the vite plugin', () => {
    makeAddSentryVitePluginSolidStart2({
      org: 'my-org',
      project: 'my-project',
      authToken: 'my-token',
      sentryUrl: 'https://my-sentry.io',
      applicationKey: 'my-app',
      silent: true,
      bundleSizeOptimizations: { excludeTracing: true },
    });

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        org: 'my-org',
        project: 'my-project',
        authToken: 'my-token',
        // `sentryUrl` is spelled `url` on the plugin.
        url: 'https://my-sentry.io',
        applicationKey: 'my-app',
        silent: true,
        bundleSizeOptimizations: { excludeTracing: true },
      }),
    );
  });

  // `buildTimeInstrumentation` configures the orchestrion plugin, not the bundler plugin.
  it('does not forward `buildTimeInstrumentation` to the vite plugin', () => {
    makeAddSentryVitePluginSolidStart2({ org: 'my-org', buildTimeInstrumentation: false });

    expect(sentryVitePluginSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ buildTimeInstrumentation: expect.anything() }),
    );
  });

  it('always tags telemetry as solidstart', () => {
    makeAddSentryVitePluginSolidStart2({ org: 'my-org' });

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        _metaOptions: { telemetry: { metaFramework: 'solidstart' } },
      }),
    );
  });

  // `filesToDeleteAfterUpload` is resolved through a deferred promise, because the default depends
  // on whether the user set `build.sourcemap` themselves - only known once Vite resolves its config.
  it('resolves `filesToDeleteAfterUpload` to the user-specified value', async () => {
    const plugins = makeAddSentryVitePluginSolidStart2({
      sourcemaps: { filesToDeleteAfterUpload: ['custom/**/*.map'] },
    });

    runConfigHook(plugins[0]!);

    await expect(lastPluginOptions?.sourcemaps?.filesToDeleteAfterUpload).resolves.toEqual(['custom/**/*.map']);
  });

  // Only clean up source maps the SDK turned on itself.
  it('defaults `filesToDeleteAfterUpload` only when the user left `build.sourcemap` unset', async () => {
    const plugins = makeAddSentryVitePluginSolidStart2({ org: 'my-org' });

    runConfigHook(plugins[0]!);

    await expect(lastPluginOptions?.sourcemaps?.filesToDeleteAfterUpload).resolves.toEqual(['./**/*.map']);
  });

  it('leaves `filesToDeleteAfterUpload` unset when the user configured `build.sourcemap`', async () => {
    const plugins = makeAddSentryVitePluginSolidStart2({ org: 'my-org' });

    runConfigHook(plugins[0]!, { build: { sourcemap: true } });

    await expect(lastPluginOptions?.sourcemaps?.filesToDeleteAfterUpload).resolves.toBeUndefined();
  });

  it('warns when the removed `unstable_sentryVitePluginOptions` is still set', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // @ts-expect-error - removed in v11, but JS configs get no type checking
    sentrySolidStart({ unstable_sentryVitePluginOptions: { org: 'other-org' } });

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('unstable_sentryVitePluginOptions'));

    consoleWarnSpy.mockRestore();
  });
});

describe('getUpdatedSourceMapSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('when sourcemap is false', () => {
    it('should keep sourcemap as false and show short warning when debug is disabled', () => {
      const result = getUpdatedSourceMapSettings({ build: { sourcemap: false } });

      expect(result).toBe(false);
      // eslint-disable-next-line no-console
      expect(console.warn).toHaveBeenCalledWith(
        '[Sentry] Source map generation is disabled in your SolidStart configuration.',
      );
    });

    it('should keep sourcemap as false and show long warning when debug is enabled', () => {
      const result = getUpdatedSourceMapSettings({ build: { sourcemap: false } }, { debug: true });

      expect(result).toBe(false);
      // eslint-disable-next-line no-console
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          '[Sentry] Source map generation is currently disabled in your SolidStart configuration',
        ),
      );
      // eslint-disable-next-line no-console
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'This setting is either a default setting or was explicitly set in your configuration.',
        ),
      );
    });
  });

  describe('when sourcemap is explicitly set to valid values', () => {
    it.each([
      ['hidden', 'hidden'],
      ['inline', 'inline'],
      [true, true],
    ] as ('inline' | 'hidden' | boolean)[][])('should keep sourcemap as %s when set to %s', (input, expected) => {
      const result = getUpdatedSourceMapSettings({ build: { sourcemap: input } }, { debug: true });

      expect(result).toBe(expected);
      // eslint-disable-next-line no-console
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(`[Sentry] We discovered \`vite.build.sourcemap\` is set to \`${input.toString()}\``),
      );
    });
  });

  describe('when sourcemap is undefined or invalid', () => {
    it.each([[undefined], ['invalid'], ['something'], [null]])(
      'should set sourcemap to hidden when value is %s',
      input => {
        const result = getUpdatedSourceMapSettings({ build: { sourcemap: input as any } }, { debug: true });

        expect(result).toBe('hidden');
        // eslint-disable-next-line no-console
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining(
            "[Sentry] Enabled source map generation in the build options with `vite.build.sourcemap: 'hidden'`",
          ),
        );
      },
    );

    it('should set sourcemap to hidden when build config is empty', () => {
      const result = getUpdatedSourceMapSettings({}, { debug: true });

      expect(result).toBe('hidden');
      // eslint-disable-next-line no-console
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(
          "[Sentry] Enabled source map generation in the build options with `vite.build.sourcemap: 'hidden'`",
        ),
      );
    });
  });
});
