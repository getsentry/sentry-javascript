import type { SentryVitePluginOptions } from '@sentry/vite-plugin';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getUpdatedSourceMapSettings,
  makeAddSentryVitePlugin,
  makeEnableSourceMapsVitePlugin,
} from '../../src/vite/sourceMaps';

const mockedSentryVitePlugin = {
  name: 'sentry-vite-debug-id-upload-plugin',
  writeBundle: vi.fn(),
};

const sentryVitePluginSpy = vi.fn((_options: SentryVitePluginOptions) => [mockedSentryVitePlugin]);

vi.mock('@sentry/vite-plugin', async () => {
  const original = (await vi.importActual('@sentry/vite-plugin')) as any;

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
});

describe('makeAddSentryVitePlugin()', () => {
  it('passes user-specified vite plugin options to vite plugin', () => {
    makeAddSentryVitePlugin(
      {
        org: 'my-org',
        authToken: 'my-token',
        sourceMapsUploadOptions: {
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

  it('should override options with unstable_sentryVitePluginOptions', () => {
    makeAddSentryVitePlugin(
      {
        org: 'my-org',
        authToken: 'my-token',
        bundleSizeOptimizations: {
          excludeTracing: true,
        },
        sourceMapsUploadOptions: {
          unstable_sentryVitePluginOptions: {
            org: 'unstable-org',
            sourcemaps: {
              assets: ['unstable/*.js'],
            },
            bundleSizeOptimizations: {
              excludeTracing: false,
            },
          },
        },
      },
      {},
    );

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        org: 'unstable-org',
        authToken: 'my-token',
        bundleSizeOptimizations: {
          excludeTracing: false,
        },
        sourcemaps: {
          assets: ['unstable/*.js'],
        },
      }),
    );
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
