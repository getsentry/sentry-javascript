import type { SentryVitePluginOptions } from '@sentry/vite-plugin';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSourceMapsVitePlugin } from '../../src/vite/sourceMaps';

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
    const [sourceMapsConfigPlugin, sentryVitePlugin] = makeSourceMapsVitePlugin({});

    expect(sourceMapsConfigPlugin?.name).toEqual('sentry-solidstart-source-maps');
    expect(sourceMapsConfigPlugin?.apply).toEqual('build');
    expect(sourceMapsConfigPlugin?.enforce).toEqual('post');
    expect(sourceMapsConfigPlugin?.config).toEqual(expect.any(Function));

    expect(sentryVitePlugin).toEqual(mockedSentryVitePlugin);
  });

  it('passes user-specified vite plugin options to vite plugin plugin', () => {
    makeSourceMapsVitePlugin({
      org: 'my-org',
      authToken: 'my-token',
      sourceMapsUploadOptions: {
        filesToDeleteAfterUpload: ['baz/*.js'],
      },
      bundleSizeOptimizations: {
        excludeTracing: true,
      },
    });

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

  it('should override options with unstable_sentryVitePluginOptions', () => {
    makeSourceMapsVitePlugin({
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
    });

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
