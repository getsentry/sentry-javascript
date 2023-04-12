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
  it('returns the custom sentry source maps plugin', () => {
    const plugin = makeCustomSentryVitePlugin();
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
    it('enables source map generation', () => {
      const plugin = makeCustomSentryVitePlugin();
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

    it('uploads source maps during the SSR build', () => {
      const plugin = makeCustomSentryVitePlugin();
      // @ts-ignore this function exists!
      plugin.configResolved({ build: { ssr: true } });
      // @ts-ignore this function exists!
      plugin.closeBundle();
      expect(mockedSentryVitePlugin.writeBundle).toHaveBeenCalledTimes(1);
    });

    it("doesn't upload source maps during the non-SSR builds", () => {
      const plugin = makeCustomSentryVitePlugin();

      // @ts-ignore this function exists!
      plugin.configResolved({ build: { ssr: false } });
      // @ts-ignore this function exists!
      plugin.closeBundle();
      expect(mockedSentryVitePlugin.writeBundle).not.toHaveBeenCalled();
    });
  });
});
