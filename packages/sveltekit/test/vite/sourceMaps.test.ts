import { vi } from 'vitest';

import type { Plugin } from 'vite';
import { makeCustomSentryVitePlugins } from '../../src/vite/sourceMaps';

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

async function getCustomSentryViteUploadSourcemapsPlugin(): Promise<Plugin | undefined> {
  const plugins = await makeCustomSentryVitePlugins({
    authToken: 'token',
    org: 'org',
    project: 'project',
    adapter: 'other',
  });
  return plugins.find(plugin => plugin.name === 'sentry-upload-sveltekit-source-maps');
}

describe('makeCustomSentryVitePlugin()', () => {
  it('returns the custom sentry source maps plugin', async () => {
    const plugin = await getCustomSentryViteUploadSourcemapsPlugin();
    expect(plugin?.name).toEqual('sentry-upload-sveltekit-source-maps');
    expect(plugin?.apply).toEqual('build');
    expect(plugin?.enforce).toEqual('post');

    expect(plugin?.resolveId).toBeInstanceOf(Function);
    expect(plugin?.transform).toBeInstanceOf(Function);

    expect(plugin?.config).toBeInstanceOf(Function);
    expect(plugin?.configResolved).toBeInstanceOf(Function);

    // instead of writeBundle, this plugin uses closeBundle
    expect(plugin?.closeBundle).toBeInstanceOf(Function);
    expect(plugin?.writeBundle).toBeUndefined();
  });

  describe('Custom sentry vite plugin', () => {
    it('enables source map generation', async () => {
      const plugin = await getCustomSentryViteUploadSourcemapsPlugin();
      // @ts-expect-error this function exists!
      const sentrifiedConfig = plugin.config({ build: { foo: {} }, test: {} });
      expect(sentrifiedConfig).toEqual({
        build: {
          foo: {},
          sourcemap: true,
        },
        test: {},
      });
    });

    it('injects the output dir into the server hooks file', async () => {
      const plugin = await getCustomSentryViteUploadSourcemapsPlugin();
      // @ts-expect-error this function exists!
      const transformOutput = await plugin.transform('foo', '/src/hooks.server.ts');
      const transformedCode = transformOutput.code;
      const transformedSourcemap = transformOutput.map;
      const expectedTransformedCode = 'foo\n; import "\0sentry-inject-global-values-file";\n';
      expect(transformedCode).toEqual(expectedTransformedCode);
      expect(transformedSourcemap).toBeDefined();
    });

    it('uploads source maps during the SSR build', async () => {
      const plugin = await getCustomSentryViteUploadSourcemapsPlugin();
      // @ts-expect-error this function exists!
      plugin.configResolved({ build: { ssr: true } });
      // @ts-expect-error this function exists!
      plugin.closeBundle();
      expect(mockedSentryVitePlugin.writeBundle).toHaveBeenCalledTimes(1);
    });

    it("doesn't upload source maps during the non-SSR builds", async () => {
      const plugin = await getCustomSentryViteUploadSourcemapsPlugin();

      // @ts-expect-error this function exists!
      plugin.configResolved({ build: { ssr: false } });
      // @ts-expect-error this function exists!
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

    const plugin = await getCustomSentryViteUploadSourcemapsPlugin();

    // @ts-expect-error this function exists!
    expect(plugin.closeBundle).not.toThrow();

    // @ts-expect-error this function exists!
    plugin.configResolved({ build: { ssr: true } });
    // @ts-expect-error this function exists!
    plugin.closeBundle();

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to upload source maps'));
    expect(consoleLogSpy).toHaveBeenCalled();
  });
});
