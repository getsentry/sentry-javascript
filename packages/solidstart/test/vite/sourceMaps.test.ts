import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSourceMapsVitePlugin } from '../../src/vite/sourceMaps';
import * as sourceMaps from '../../src/vite/sourceMaps';

const mockedSentryVitePlugin = {
  name: 'sentry-vite-debug-id-upload-plugin',
  writeBundle: vi.fn(),
};

vi.mock('@sentry/vite-plugin', async () => {
  const original = (await vi.importActual('@sentry/vite-plugin')) as any;

  return {
    ...original,
    sentryVitePlugin: () => [mockedSentryVitePlugin],
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('makeSourceMapsVitePlugin()', () => {
  it('returns a plugin to set `sourcemaps` to `true`', async () => {
    const [sourceMapsConfigPlugin, sentryVitePlugin] = makeSourceMapsVitePlugin({});

    expect(sourceMapsConfigPlugin?.name).toEqual('sentry-solidstart-source-maps');
    expect(sourceMapsConfigPlugin?.apply).toEqual('build');
    expect(sourceMapsConfigPlugin?.enforce).toEqual('post');
    expect(sourceMapsConfigPlugin?.config).toEqual(expect.any(Function));

    expect(sentryVitePlugin).toEqual(mockedSentryVitePlugin);
  });

  it('passes user-specified vite plugin options to vite plugin plugin', async () => {
    const makePluginSpy = vi.spyOn(sourceMaps, 'makeSourceMapsVitePlugin');

    makeSourceMapsVitePlugin({
      org: 'my-org',
      authToken: 'my-token',
      sourcemaps: {
        assets: ['foo/*.js'],
        ignore: ['bar/*.js'],
        filesToDeleteAfterUpload: ['baz/*.js'],
      },
    });

    expect(makePluginSpy).toHaveBeenCalledWith({
      org: 'my-org',
      authToken: 'my-token',
      sourcemaps: {
        assets: ['foo/*.js'],
        ignore: ['bar/*.js'],
        filesToDeleteAfterUpload: ['baz/*.js'],
      },
    });
  });
});
