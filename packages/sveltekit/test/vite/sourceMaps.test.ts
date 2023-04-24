import { vi } from 'vitest';

import { makeCustomSentryVitePlugin } from '../../src/vite/sourceMaps';

const mockedSentryVitePlugin = {
  buildStart: vi.fn(),
  resolveId: vi.fn(),
  renderChunk: vi.fn(),
  transform: vi.fn(),
  writeBundle: vi.fn(),
};

vi.mock('@sentry/vite-plugin', async () => {
  const original = (await vi.importActual('@sentry/vite-plugin')) as any;

  return {
    ...original,
    sentryVitePlugin: () => mockedSentryVitePlugin,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('makeCustomSentryVitePlugin()', () => {
  it('returns the custom sentry source maps plugin', async () => {
    const plugin = await makeCustomSentryVitePlugin();
    expect(plugin.name).toEqual('sentry-vite-plugin-custom');
    expect(plugin.apply).toEqual('build');
    expect(plugin.enforce).toEqual('post');

    expect(plugin.buildStart).toBeInstanceOf(Function);
    expect(plugin.resolveId).toBeInstanceOf(Function);
    expect(plugin.renderChunk).toBeInstanceOf(Function);
    expect(plugin.transform).toBeInstanceOf(Function);

    expect(plugin.config).toBeInstanceOf(Function);
    expect(plugin.configResolved).toBeInstanceOf(Function);
    expect(plugin.closeBundle).toBeInstanceOf(Function);
  });

  describe('Custom sentry vite plugin', () => {
    it('enables source map generation', async () => {
      const plugin = await makeCustomSentryVitePlugin();
      // @ts-ignore this function exists!
      const sentrifiedConfig = plugin.config({ build: { foo: {} }, test: {} });
      expect(sentrifiedConfig).toEqual({
        build: {
          foo: {},
          sourcemap: true,
        },
        test: {},
      });
    });

    it('uploads source maps during the SSR build', async () => {
      const plugin = await makeCustomSentryVitePlugin();
      // @ts-ignore this function exists!
      plugin.configResolved({ build: { ssr: true } });
      // @ts-ignore this function exists!
      plugin.closeBundle();
      expect(mockedSentryVitePlugin.writeBundle).toHaveBeenCalledTimes(1);
    });

    it("doesn't upload source maps during the non-SSR builds", async () => {
      const plugin = await makeCustomSentryVitePlugin();

      // @ts-ignore this function exists!
      plugin.configResolved({ build: { ssr: false } });
      // @ts-ignore this function exists!
      plugin.closeBundle();
      expect(mockedSentryVitePlugin.writeBundle).not.toHaveBeenCalled();
    });
  });

  it('catches errors while uploading source maps', async () => {
    mockedSentryVitePlugin.writeBundle.mockImplementationOnce(() => {
      throw new Error('test error');
    });

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const plugin = await makeCustomSentryVitePlugin();

    // @ts-ignore this function exists!
    expect(plugin.closeBundle).not.toThrow();

    // @ts-ignore this function exists!
    plugin.configResolved({ build: { ssr: true } });
    // @ts-ignore this function exists!
    plugin.closeBundle();

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to upload source maps'));
    expect(consoleLogSpy).toHaveBeenCalled();
  });
});
