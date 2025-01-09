import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Plugin } from 'vite';
import { makeCustomSentryVitePlugins } from '../../src/vite/sourceMaps';

const mockedViteDebugIdUploadPlugin = {
  name: 'sentry-vite-debug-id-upload-plugin',
  writeBundle: vi.fn(),
};

const mockedViteReleaseManagementPlugin = {
  name: 'sentry-release-management-plugin',
  writeBundle: vi.fn(),
};

const mockedFileDeletionPlugin = {
  name: 'sentry-file-deletion-plugin',
  writeBundle: vi.fn(),
};

vi.mock('@sentry/vite-plugin', async () => {
  const original = (await vi.importActual('@sentry/vite-plugin')) as any;

  return {
    ...original,
    sentryVitePlugin: () => [
      mockedViteReleaseManagementPlugin,
      mockedViteDebugIdUploadPlugin,
      mockedFileDeletionPlugin,
    ],
  };
});

vi.mock('sorcery', async () => {
  return {
    load: vi.fn().mockResolvedValue({
      apply: vi.fn().mockResolvedValue(undefined),
      write: vi.fn().mockResolvedValue(undefined),
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

async function getSentryViteSubPlugin(name: string): Promise<Plugin | undefined> {
  const plugins = await makeCustomSentryVitePlugins({
    authToken: 'token',
    org: 'org',
    project: 'project',
    adapter: 'other',
  });

  return plugins.find(plugin => plugin.name === name);
}

describe('makeCustomSentryVitePlugin()', () => {
  it('returns the custom sentry source maps plugin', async () => {
    const plugin = await getSentryViteSubPlugin('sentry-sveltekit-debug-id-upload-plugin');

    expect(plugin?.name).toEqual('sentry-sveltekit-debug-id-upload-plugin');
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

  describe('Custom debug id source maps plugin plugin', () => {
    it('enables source map generation', async () => {
      const plugin = await getSentryViteSubPlugin('sentry-sveltekit-debug-id-upload-plugin');
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
      const plugin = await getSentryViteSubPlugin('sentry-sveltekit-debug-id-upload-plugin');
      // @ts-expect-error this function exists!
      const transformOutput = await plugin.transform('foo', '/src/hooks.server.ts');
      const transformedCode = transformOutput.code;
      const transformedSourcemap = transformOutput.map;
      const expectedTransformedCode = 'foo\n; import "\0sentry-inject-global-values-file";\n';
      expect(transformedCode).toEqual(expectedTransformedCode);
      expect(transformedSourcemap).toBeDefined();
    });

    it('uploads source maps during the SSR build', async () => {
      const plugin = await getSentryViteSubPlugin('sentry-sveltekit-debug-id-upload-plugin');
      // @ts-expect-error this function exists!
      plugin.configResolved({ build: { ssr: true } });
      // @ts-expect-error this function exists!
      await plugin.closeBundle();
      expect(mockedViteDebugIdUploadPlugin.writeBundle).toHaveBeenCalledTimes(1);
    });

    it("doesn't upload source maps during the non-SSR builds", async () => {
      const plugin = await getSentryViteSubPlugin('sentry-sveltekit-debug-id-upload-plugin');

      // @ts-expect-error this function exists!
      plugin.configResolved({ build: { ssr: false } });
      // @ts-expect-error this function exists!
      await plugin.closeBundle();
      expect(mockedViteDebugIdUploadPlugin.writeBundle).not.toHaveBeenCalled();
    });
  });

  it('catches errors while uploading source maps', async () => {
    mockedViteDebugIdUploadPlugin.writeBundle.mockImplementationOnce(() => {
      throw new Error('test error');
    });

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementationOnce(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementationOnce(() => {});

    const plugin = await getSentryViteSubPlugin('sentry-sveltekit-debug-id-upload-plugin');

    // @ts-expect-error this function exists!
    expect(plugin.closeBundle).not.toThrow();

    // @ts-expect-error this function exists!
    plugin.configResolved({ build: { ssr: true } });
    // @ts-expect-error this function exists!
    await plugin.closeBundle();

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to upload source maps'));
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  describe('Custom release management plugin', () => {
    it('has the expected hooks and properties', async () => {
      const plugin = await getSentryViteSubPlugin('sentry-sveltekit-release-management-plugin');

      expect(plugin).toEqual({
        name: 'sentry-sveltekit-release-management-plugin',
        apply: 'build',
        enforce: 'post',
        closeBundle: expect.any(Function),
      });
    });

    it('calls the original release management plugin to start the release creation pipeline', async () => {
      const plugin = await getSentryViteSubPlugin('sentry-sveltekit-release-management-plugin');
      // @ts-expect-error this function exists!
      await plugin.closeBundle();
      expect(mockedViteReleaseManagementPlugin.writeBundle).toHaveBeenCalledTimes(1);
    });

    it('catches errors during release creation', async () => {
      mockedViteReleaseManagementPlugin.writeBundle.mockImplementationOnce(() => {
        throw new Error('test error');
      });

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementationOnce(() => {});

      const plugin = await getSentryViteSubPlugin('sentry-sveltekit-release-management-plugin');

      // @ts-expect-error this function exists!
      expect(plugin.closeBundle).not.toThrow();

      // @ts-expect-error this function exists!
      await plugin.closeBundle();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to upload release data'),
        expect.any(Error),
      );
    });

    it('also works correctly if the original release management plugin has its old name', async () => {
      const currentName = mockedViteReleaseManagementPlugin.name;
      mockedViteReleaseManagementPlugin.name = 'sentry-debug-id-upload-plugin';

      const plugin = await getSentryViteSubPlugin('sentry-sveltekit-release-management-plugin');

      // @ts-expect-error this function exists!
      await plugin.closeBundle();

      expect(mockedViteReleaseManagementPlugin.writeBundle).toHaveBeenCalledTimes(1);

      mockedViteReleaseManagementPlugin.name = currentName;
    });
  });

  describe('Custom file deletion plugin', () => {
    it('has the expected hooks and properties', async () => {
      const plugin = await getSentryViteSubPlugin('sentry-sveltekit-file-deletion-plugin');

      expect(plugin).toEqual({
        name: 'sentry-sveltekit-file-deletion-plugin',
        apply: 'build',
        enforce: 'post',
        closeBundle: expect.any(Function),
      });
    });

    it('calls the original file deletion plugin to delete files', async () => {
      const plugin = await getSentryViteSubPlugin('sentry-sveltekit-file-deletion-plugin');
      // @ts-expect-error this function exists!
      await plugin.closeBundle();
      expect(mockedFileDeletionPlugin.writeBundle).toHaveBeenCalledTimes(1);
    });

    it('catches errors during file deletion', async () => {
      mockedFileDeletionPlugin.writeBundle.mockImplementationOnce(() => {
        throw new Error('test error');
      });

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementationOnce(() => {});

      const plugin = await getSentryViteSubPlugin('sentry-sveltekit-file-deletion-plugin');

      // @ts-expect-error this function exists!
      expect(plugin.closeBundle).not.toThrow();

      // @ts-expect-error this function exists!
      await plugin.closeBundle();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete source maps'),
        expect.any(Error),
      );
    });
  });
});
