import { sentryVitePlugin } from '@sentry/vite-plugin';
import type { Plugin } from 'vite';
import * as vite from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViteUserConfig } from 'vitest/config';
import { _getUpdatedSourceMapSettings, makeCustomSentryVitePlugins } from '../../src/vite/sourceMaps';

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
    sentryVitePlugin: vi.fn(),
  };
});

vi.mock('vite', async () => {
  const original = (await vi.importActual('vite')) as any;

  return {
    ...original,
    loadConfigFromFile: vi.fn(),
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
  const plugins = await makeCustomSentryVitePlugins(
    {
      authToken: 'token',
      org: 'org',
      project: 'project',
      adapter: 'other',
    },
    { kit: {} },
  );

  return plugins.find(plugin => plugin.name === name);
}

describe('makeCustomSentryVitePlugins()', () => {
  beforeEach(() => {
    // @ts-expect-error - this function exists!
    sentryVitePlugin.mockReturnValue([
      mockedViteReleaseManagementPlugin,
      mockedViteDebugIdUploadPlugin,
      mockedFileDeletionPlugin,
    ]);
  });

  it('returns the custom sentry source maps plugin', async () => {
    const plugin = await getSentryViteSubPlugin('sentry-sveltekit-debug-id-upload-plugin');

    expect(plugin?.name).toEqual('sentry-sveltekit-debug-id-upload-plugin');
    expect(plugin?.apply).toEqual('build');
    expect(plugin?.enforce).toEqual('post');

    expect(plugin?.resolveId).toBeUndefined();
    expect(plugin?.transform).toBeUndefined();

    expect(plugin?.configResolved).toBeInstanceOf(Function);

    // instead of writeBundle, this plugin uses closeBundle
    expect(plugin?.closeBundle).toBeInstanceOf(Function);
    expect(plugin?.writeBundle).toBeUndefined();
  });

  describe('Custom source map settings update plugin', () => {
    beforeEach(() => {
      // @ts-expect-error - this global variable is set/accessed in src/vite/sourceMaps.ts
      globalThis._sentry_sourceMapSetting = undefined;
    });

    it('returns the custom sentry source maps plugin', async () => {
      const plugin = await getSentryViteSubPlugin('sentry-sveltekit-update-source-map-setting-plugin');

      expect(plugin).toEqual({
        name: 'sentry-sveltekit-update-source-map-setting-plugin',
        apply: 'build',
        config: expect.any(Function),
      });
    });

    it('keeps source map generation settings when previously enabled', async () => {
      const originalConfig = {
        build: { sourcemap: true, assetsDir: 'assets' },
      };

      vi.spyOn(vite, 'loadConfigFromFile').mockResolvedValueOnce({
        path: '',
        config: originalConfig,
        dependencies: [],
      });

      const plugin = await getSentryViteSubPlugin('sentry-sveltekit-update-source-map-setting-plugin');

      // @ts-expect-error this function exists!
      const sentryConfig = await plugin.config(originalConfig);

      expect(sentryConfig).toEqual(originalConfig);
    });

    it('keeps source map generation settings when previously disabled', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementationOnce(() => {});

      const originalConfig = {
        build: { sourcemap: false, assetsDir: 'assets' },
      };

      vi.spyOn(vite, 'loadConfigFromFile').mockResolvedValueOnce({
        path: '',
        config: originalConfig,
        dependencies: [],
      });

      const plugin = await getSentryViteSubPlugin('sentry-sveltekit-update-source-map-setting-plugin');

      // @ts-expect-error this function exists!
      const sentryConfig = await plugin.config(originalConfig);

      expect(sentryConfig).toEqual({
        build: {
          ...originalConfig.build,
          sourcemap: false,
        },
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Sentry] Source map generation is disabled in your Vite configuration.',
      );
    });

    it('enables source map generation with "hidden" when unset', async () => {
      const originalConfig = {
        build: { assetsDir: 'assets' },
      };

      vi.spyOn(vite, 'loadConfigFromFile').mockResolvedValueOnce({
        path: '',
        config: originalConfig,
        dependencies: [],
      });

      const plugin = await getSentryViteSubPlugin('sentry-sveltekit-update-source-map-setting-plugin');
      // @ts-expect-error this function exists!
      const sentryConfig = await plugin.config(originalConfig);
      expect(sentryConfig).toEqual({
        ...originalConfig,
        build: {
          ...originalConfig.build,
          sourcemap: 'hidden',
        },
      });
    });
  });

  // Note: The global values injection plugin tests are now in a separate test file
  // since the plugin was moved to injectGlobalValues.ts

  describe('Custom debug id source maps plugin plugin', () => {
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

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

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

describe('_getUpdatedSourceMapSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('when sourcemap is false', () => {
    it('should keep sourcemap as false and show short warning when debug is disabled', () => {
      const result = _getUpdatedSourceMapSettings({ build: { sourcemap: false } });

      expect(result).toBe(false);
      // eslint-disable-next-line no-console
      expect(console.warn).toHaveBeenCalledWith(
        '[Sentry] Source map generation is disabled in your Vite configuration.',
      );
    });

    it('should keep sourcemap as false and show long warning when debug is enabled', () => {
      const result = _getUpdatedSourceMapSettings({ build: { sourcemap: false } }, { debug: true });

      expect(result).toBe(false);
      // eslint-disable-next-line no-console
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[Sentry] Source map generation is currently disabled in your Vite configuration'),
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
      const result = _getUpdatedSourceMapSettings({ build: { sourcemap: input } }, { debug: true });

      expect(result).toBe(expected);
      // eslint-disable-next-line no-console
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(`[Sentry] We discovered \`build.sourcemap\` is set to \`${input.toString()}\``),
      );
    });
  });

  describe('when sourcemap is undefined or invalid', () => {
    it.each([[undefined], ['invalid'], ['something'], [null]])(
      'should set sourcemap to hidden when value is %s',
      input => {
        const result = _getUpdatedSourceMapSettings({ build: { sourcemap: input as any } }, { debug: true });

        expect(result).toBe('hidden');
        // eslint-disable-next-line no-console
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining(
            "[Sentry] Enabled source map generation in the build options with `build.sourcemap: 'hidden'`",
          ),
        );
      },
    );

    it('should set sourcemap to hidden when build config is empty', () => {
      const result = _getUpdatedSourceMapSettings({}, { debug: true });

      expect(result).toBe('hidden');
      // eslint-disable-next-line no-console
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(
          "[Sentry] Enabled source map generation in the build options with `build.sourcemap: 'hidden'`",
        ),
      );
    });
  });
});

describe('deleteFilesAfterUpload', () => {
  it('works with defauts', async () => {
    const viteConfig: ViteUserConfig = {};

    vi.mock('@sentry/vite-plugin', async () => {
      const original = (await vi.importActual('@sentry/vite-plugin')) as any;

      return {
        ...original,
        sentryVitePlugin: vi.fn(original.sentryVitePlugin),
      };
    });

    const plugins = await makeCustomSentryVitePlugins(
      {
        authToken: 'token',
        org: 'org',
        project: 'project',
        adapter: 'other',
      },
      { kit: {} },
    );

    // @ts-expect-error this function exists!
    const mergedOptions = sentryVitePlugin.mock.calls[0][0];

    expect(mergedOptions).toEqual({
      _metaOptions: {
        telemetry: {
          metaFramework: 'sveltekit',
        },
      },
      authToken: 'token',
      org: 'org',
      project: 'project',
      adapter: 'other',
      release: {
        name: expect.any(String),
      },
      sourcemaps: {
        filesToDeleteAfterUpload: expect.any(Promise),
      },
    });

    const sourceMapSettingPlugin = plugins.find(
      plugin => plugin.name === 'sentry-sveltekit-update-source-map-setting-plugin',
    )!;

    // @ts-expect-error this function exists!
    const sourceMapSettingConfig = await sourceMapSettingPlugin.config(viteConfig);
    expect(sourceMapSettingConfig).toEqual({ build: { sourcemap: 'hidden' } });

    const filesToDeleteAfterUploadSettingPlugin = plugins.find(
      plugin => plugin.name === 'sentry-sveltekit-files-to-delete-after-upload-setting-plugin',
    )!;

    // call this to ensure the filesToDeleteAfterUpload setting is resolved
    // @ts-expect-error this function exists!
    await filesToDeleteAfterUploadSettingPlugin.config(viteConfig);

    await expect(mergedOptions.sourcemaps.filesToDeleteAfterUpload).resolves.toEqual([
      './.*/**/*.map',
      './.svelte-kit/output/**/*.map',
    ]);
  });

  it.each([
    [['blub/'], undefined, 'hidden', ['blub/']],
    [['blub/'], false, false, ['blub/']],
    [undefined, 'hidden' as const, 'hidden', undefined],
    [undefined, false, false, undefined],
    [undefined, true, true, undefined],
    [['/blub/'], true, true, ['/blub/']],
  ])(
    'works with filesToDeleteAfterUpload: %j & sourcemap: %s',
    async (filesToDeleteAfterUpload, sourcemap, sourcemapExpected, filesToDeleteAfterUploadExpected) => {
      const viteConfig: ViteUserConfig = {
        build: {
          sourcemap,
        },
      };

      vi.mock('@sentry/vite-plugin', async () => {
        const original = (await vi.importActual('@sentry/vite-plugin')) as any;

        return {
          ...original,
          sentryVitePlugin: vi.fn(original.sentryVitePlugin),
        };
      });

      const plugins = await makeCustomSentryVitePlugins(
        {
          authToken: 'token',
          org: 'org',
          project: 'project',
          adapter: 'other',
          sourcemaps: {
            filesToDeleteAfterUpload,
          },
        },
        { kit: {} },
      );

      // @ts-expect-error this function exists!
      const mergedOptions = sentryVitePlugin.mock.calls[0][0];

      expect(mergedOptions).toEqual({
        _metaOptions: {
          telemetry: {
            metaFramework: 'sveltekit',
          },
        },
        authToken: 'token',
        org: 'org',
        project: 'project',
        adapter: 'other',
        release: {
          name: expect.any(String),
        },
        sourcemaps: {
          filesToDeleteAfterUpload: expect.any(Promise),
        },
      });

      const sourceMapSettingPlugin = plugins.find(
        plugin => plugin.name === 'sentry-sveltekit-update-source-map-setting-plugin',
      )!;

      // @ts-expect-error this function exists!
      const sourceMapSettingConfig = await sourceMapSettingPlugin.config(viteConfig);
      expect(sourceMapSettingConfig).toEqual({ build: { sourcemap: sourcemapExpected } });

      const filesToDeleteAfterUploadSettingPlugin = plugins.find(
        plugin => plugin.name === 'sentry-sveltekit-files-to-delete-after-upload-setting-plugin',
      )!;

      // call this to ensure the filesToDeleteAfterUpload setting is resolved
      // @ts-expect-error this function exists!
      await filesToDeleteAfterUploadSettingPlugin.config(viteConfig);

      await expect(mergedOptions.sourcemaps.filesToDeleteAfterUpload).resolves.toEqual(
        filesToDeleteAfterUploadExpected,
      );
    },
  );
});
