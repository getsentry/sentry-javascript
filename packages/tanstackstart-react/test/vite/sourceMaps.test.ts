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

vi.mock('@sentry/vite-plugin', () => ({
  sentryVitePlugin: (options: SentryVitePluginOptions) => sentryVitePluginSpy(options),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('makeEnableSourceMapsVitePlugin()', () => {
  it('returns a plugin to enable source maps', () => {
    const sourceMapsConfigPlugins = makeEnableSourceMapsVitePlugin({});
    const enableSourceMapPlugin = sourceMapsConfigPlugins[0];

    expect(enableSourceMapPlugin?.name).toEqual('sentry-tanstackstart-react-source-maps');
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

  it('sets the correct metaFramework in telemetry options', () => {
    makeAddSentryVitePlugin(
      {
        org: 'my-org',
        authToken: 'my-token',
      },
      {},
    );

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        _metaOptions: {
          telemetry: {
            metaFramework: 'tanstackstart-react',
          },
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

  it('should keep sourcemap as false and emit warning when explicitly disabled', () => {
    const result = getUpdatedSourceMapSettings({ build: { sourcemap: false } });

    expect(result).toBe(false);
    // eslint-disable-next-line no-console
    expect(console.warn).toHaveBeenCalled();
  });

  it.each([
    ['hidden', 'hidden'],
    ['inline', 'inline'],
    [true, true],
  ] as const)('should keep sourcemap as %s when explicitly set', (input, expected) => {
    const result = getUpdatedSourceMapSettings({ build: { sourcemap: input } });

    expect(result).toBe(expected);
  });

  it('should set sourcemap to hidden when not configured', () => {
    const result = getUpdatedSourceMapSettings({});

    expect(result).toBe('hidden');
  });
});
