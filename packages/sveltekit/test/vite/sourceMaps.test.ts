import { sentryVitePlugin } from '@sentry/bundler-plugins/vite';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Plugin } from 'vite';
import * as vite from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViteUserConfig } from 'vitest/config';
import { _getUpdatedSourceMapSettings, makeCustomSentryVitePlugins } from '../../src/vite/sourceMaps';

const mockedMainPlugin = {
  name: 'sentry-vite-plugin',
  writeBundle: vi.fn(),
};

vi.mock('child_process', { spy: true });

vi.mock('@sentry/bundler-plugins/vite', async () => {
  const original = (await vi.importActual('@sentry/bundler-plugins/vite')) as any;

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
    },
    { getAdapterOutputDir: async () => '.svelte-kit/output', getKitConfig: async () => ({}) },
  );

  return plugins.find(plugin => plugin.name === name);
}

describe('release detection', () => {
  it('hides the console when detecting the git revision', async () => {
    vi.resetModules();
    const execSpy = vi
      .mocked(childProcess.execSync)
      .mockReturnValueOnce(Buffer.from('4316c2634a5f3de43cbd63780117d9221a23e3cd\n'));

    await import('../../src/vite/sourceMaps');

    expect(execSpy).toHaveBeenCalledWith('git rev-parse HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
  });
});

describe('makeCustomSentryVitePlugins()', () => {
  beforeEach(() => {
    // @ts-expect-error - this function exists!
    sentryVitePlugin.mockReturnValue([mockedMainPlugin]);
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
      expect(mockedMainPlugin.writeBundle).toHaveBeenCalledTimes(1);
    });

    it("doesn't upload source maps during the non-SSR builds", async () => {
      const plugin = await getSentryViteSubPlugin('sentry-sveltekit-debug-id-upload-plugin');

      // @ts-expect-error this function exists!
      plugin.configResolved({ build: { ssr: false } });
      // @ts-expect-error this function exists!
      await plugin.closeBundle();
      expect(mockedMainPlugin.writeBundle).not.toHaveBeenCalled();
    });

    it('uploads source maps in the post `buildApp` hook when there is no separate SSR build (SvelteKit 3)', async () => {
      const plugin = await getSentryViteSubPlugin('sentry-sveltekit-debug-id-upload-plugin');

      // @ts-expect-error this function exists!
      plugin.configResolved({ build: { ssr: false } });
      // @ts-expect-error this function exists!
      await plugin.closeBundle();
      expect(mockedMainPlugin.writeBundle).not.toHaveBeenCalled();

      expect(plugin?.buildApp).toEqual({ order: 'post', handler: expect.any(Function) });
      // @ts-expect-error this function exists!
      await plugin.buildApp.handler({ environments: { ssr: { isBuilt: true }, client: { isBuilt: true } } });
      expect(mockedMainPlugin.writeBundle).toHaveBeenCalledTimes(1);
    });

    it("doesn't upload source maps in the post `buildApp` hook before any environment was built (SvelteKit 2 on Vite 7+)", async () => {
      const plugin = await getSentryViteSubPlugin('sentry-sveltekit-debug-id-upload-plugin');

      // @ts-expect-error this function exists!
      await plugin.buildApp.handler({ environments: { ssr: { isBuilt: false } } });
      expect(mockedMainPlugin.writeBundle).not.toHaveBeenCalled();

      // @ts-expect-error this function exists!
      plugin.configResolved({ build: { ssr: true } });
      // @ts-expect-error this function exists!
      await plugin.closeBundle();
      expect(mockedMainPlugin.writeBundle).toHaveBeenCalledTimes(1);
    });

    it('uploads source maps only once when both `closeBundle` and `buildApp` run (SvelteKit 2 on Vite 7+)', async () => {
      const plugin = await getSentryViteSubPlugin('sentry-sveltekit-debug-id-upload-plugin');

      // @ts-expect-error this function exists!
      plugin.configResolved({ build: { ssr: true } });
      // @ts-expect-error this function exists!
      await plugin.closeBundle();
      // @ts-expect-error this function exists!
      await plugin.buildApp.handler({ environments: { ssr: { isBuilt: true } } });

      expect(mockedMainPlugin.writeBundle).toHaveBeenCalledTimes(1);
    });

    it('uploads source maps on every SSR rebuild in watch mode', async () => {
      const plugin = await getSentryViteSubPlugin('sentry-sveltekit-debug-id-upload-plugin');

      // @ts-expect-error this function exists!
      plugin.configResolved({ build: { ssr: true } });
      // @ts-expect-error this function exists!
      await plugin.closeBundle();
      // @ts-expect-error this function exists!
      await plugin.closeBundle();

      expect(mockedMainPlugin.writeBundle).toHaveBeenCalledTimes(2);
    });
  });

  describe('release injection', () => {
    async function getPlugins(release?: { name?: string; inject?: boolean }): Promise<Plugin[]> {
      return makeCustomSentryVitePlugins(
        { authToken: 'token', org: 'org', project: 'project', release },
        { getAdapterOutputDir: async () => '.svelte-kit/output', getKitConfig: async () => ({}) },
      );
    }

    it('turns off build-time injection and injects the release itself', async () => {
      const plugins = await getPlugins({ name: '1.0.0' });

      expect(sentryVitePlugin).toHaveBeenCalledWith(
        expect.objectContaining({ release: { name: '1.0.0', inject: false } }),
      );
      expect(plugins.map(plugin => plugin.name)).toContain('sentry-sveltekit-release-injection-plugin');
    });

    it('injects no release if the user turned injection off', async () => {
      const plugins = await getPlugins({ name: '1.0.0', inject: false });

      expect(sentryVitePlugin).toHaveBeenCalledWith(
        expect.objectContaining({ release: { name: '1.0.0', inject: false } }),
      );
      expect(plugins.map(plugin => plugin.name)).not.toContain('sentry-sveltekit-release-injection-plugin');
    });
  });

  it('catches errors while uploading source maps', async () => {
    mockedMainPlugin.writeBundle.mockImplementationOnce(() => {
      throw new Error('test error');
    });

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const plugin = await getSentryViteSubPlugin('sentry-sveltekit-debug-id-upload-plugin');

    // @ts-expect-error this function exists!
    plugin.configResolved({ build: { ssr: true } });
    // @ts-expect-error this function exists!
    await expect(plugin.closeBundle()).resolves.toBeUndefined();

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to upload source maps'));
    expect(consoleLogSpy).toHaveBeenCalled();
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

describe('_getUpdatedSourceMapSettings with the source map options', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it.each([
    [{ upload: false }, undefined],
    [{ injectDebugIds: false }, undefined],
    [{ upload: false, delete: false }, 'hidden'],
    [{ injectDebugIds: false, delete: false }, undefined],
    [{ delete: false }, 'hidden'],
    [{ delete: true }, 'hidden'],
    [{ disable: true }, undefined],
    [{ disable: 'disable-upload' }, 'hidden'],
  ] as const)('with an unset setting and %j it returns %s', (sourcemaps, expected) => {
    expect(_getUpdatedSourceMapSettings({}, { sourcemaps })).toBe(expected);
  });

  it.each([
    [true, { delete: true }, 'hidden'],
    ['hidden', { delete: true }, 'hidden'],
    ['inline', { delete: true }, 'inline'],
    [true, { delete: false }, true],
    [true, { upload: false }, true],
    [false, { delete: true }, false],
  ] as const)('with the setting %s and %j it returns %s', (sourcemap, sourcemaps, expected) => {
    expect(_getUpdatedSourceMapSettings({ build: { sourcemap } }, { sourcemaps })).toBe(expected);
  });
});

describe('source map deletion with `sourcemaps.delete`', () => {
  const DEFAULT_GLOBS = ['./.*/**/*.map', './.svelte-kit/output/**/*.map'];

  async function getFilesToDelete(
    sourcemaps: NonNullable<Parameters<typeof makeCustomSentryVitePlugins>[0]>['sourcemaps'],
    sourcemap?: boolean | 'hidden',
  ): Promise<unknown> {
    vi.mocked(sentryVitePlugin).mockReturnValueOnce([{ ...mockedMainPlugin }] as any);
    const plugins = await makeCustomSentryVitePlugins(
      { authToken: 'token', org: 'org', project: 'project', sourcemaps },
      { getAdapterOutputDir: async () => '.svelte-kit/output' },
    );
    const mergedOptions = vi.mocked(sentryVitePlugin).mock.lastCall![0]!;

    const settingPlugin = plugins.find(p => p.name === 'sentry-sveltekit-update-source-map-setting-plugin')!;
    // @ts-expect-error this function exists!
    await settingPlugin.config({ build: { sourcemap } });

    const deletionPlugin = plugins.find(
      p => p.name === 'sentry-sveltekit-files-to-delete-after-upload-setting-plugin',
    )!;
    // @ts-expect-error this function exists!
    await deletionPlugin.configResolved();

    expect(mergedOptions.sourcemaps).toMatchObject({ deleteSourcemapsAfterUpload: false, delete: undefined });
    return mergedOptions.sourcemaps?.filesToDeleteAfterUpload;
  }

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it.each([undefined, true, 'hidden'] as const)(
    'deletes every source map with `true` (setting: %s)',
    async sourcemap => {
      await expect(getFilesToDelete({ delete: true }, sourcemap)).resolves.toEqual(DEFAULT_GLOBS);
    },
  );

  it('adds the user globs with `true`', async () => {
    await expect(getFilesToDelete({ delete: true, filesToDeleteAfterUpload: 'extra/*.txt' })).resolves.toEqual([
      ...DEFAULT_GLOBS,
      'extra/*.txt',
    ]);
  });

  it('deletes with `true` when nothing is uploaded', async () => {
    await expect(getFilesToDelete({ delete: true, upload: false }, true)).resolves.toEqual(DEFAULT_GLOBS);
  });

  it.each([undefined, true] as const)('deletes nothing with `false` (setting: %s)', async sourcemap => {
    await expect(getFilesToDelete({ delete: false }, sourcemap)).resolves.toBeUndefined();
  });

  it('only runs the user globs with `false`', async () => {
    await expect(getFilesToDelete({ delete: false, filesToDeleteAfterUpload: ['extra/*.txt'] })).resolves.toEqual([
      'extra/*.txt',
    ]);
  });

  it.each([{ disable: true }, { upload: false }, { injectDebugIds: false }] as const)(
    'deletes nothing when the SDK turned no source maps on (%j)',
    async sourcemaps => {
      await expect(getFilesToDelete(sourcemaps)).resolves.toBeUndefined();
    },
  );

  it('still deletes the source maps the SDK turned on with `disable: "disable-upload"`', async () => {
    await expect(getFilesToDelete({ disable: 'disable-upload' })).resolves.toEqual(DEFAULT_GLOBS);
  });
});

describe('debug IDs without an upload', () => {
  const DEBUG_ID = 'e3ee452d-c255-448c-aa62-da0fd4c49e46';
  let outDir: string;

  beforeEach(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-sveltekit-stamp-'));
    fs.writeFileSync(
      path.join(outDir, 'entry.js'),
      `globalThis._sentryDebugIdIdentifier="sentry-dbid-${DEBUG_ID}";\n//# sourceMappingURL=entry.js.map\n`,
    );
    // What the flattening step leaves behind: a map without the debug ID fields.
    fs.writeFileSync(
      path.join(outDir, 'entry.js.map'),
      JSON.stringify({ version: 3, sources: [], names: [], mappings: '' }),
    );

    return () => fs.rmSync(outDir, { recursive: true, force: true });
  });

  async function runUpload(sourcemaps: NonNullable<Parameters<typeof makeCustomSentryVitePlugins>[0]>['sourcemaps']) {
    vi.mocked(sentryVitePlugin).mockReturnValueOnce([{ ...mockedMainPlugin }] as any);
    const plugins = await makeCustomSentryVitePlugins(
      { authToken: 'token', org: 'org', project: 'project', sourcemaps },
      { getAdapterOutputDir: async () => outDir },
    );
    const plugin = plugins.find(p => p.name === 'sentry-sveltekit-debug-id-upload-plugin')!;
    // @ts-expect-error this function exists!
    plugin.configResolved({ build: { ssr: true } });
    // @ts-expect-error this function exists!
    await plugin.closeBundle();
    return JSON.parse(fs.readFileSync(path.join(outDir, 'entry.js.map'), 'utf8'));
  }

  it.each([{ upload: false }, { disable: 'disable-upload' }] as const)(
    'writes the debug IDs back into the flattened source maps with %j',
    async sourcemaps => {
      expect(await runUpload(sourcemaps)).toMatchObject({ debug_id: DEBUG_ID });
      expect(fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8')).toContain(`//# debugId=${DEBUG_ID}`);
    },
  );

  it.each([undefined, { injectDebugIds: false }, { disable: true }] as const)(
    'leaves the source maps alone with %j',
    async sourcemaps => {
      expect(await runUpload(sourcemaps)).not.toHaveProperty('debug_id');
    },
  );
});

describe('deleteFilesAfterUpload', () => {
  it('works with defauts', async () => {
    const viteConfig: ViteUserConfig = {};

    vi.mock('@sentry/bundler-plugins/vite', async () => {
      const original = (await vi.importActual('@sentry/bundler-plugins/vite')) as any;

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
      },
      { getAdapterOutputDir: async () => '.svelte-kit/output', getKitConfig: async () => ({}) },
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
      release: {
        name: expect.any(String),
        inject: false,
      },
      sourcemaps: {
        filesToDeleteAfterUpload: expect.any(Promise),
        deleteSourcemapsAfterUpload: false,
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

    // @ts-expect-error this function exists!
    await filesToDeleteAfterUploadSettingPlugin.configResolved();

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

      vi.mock('@sentry/bundler-plugins/vite', async () => {
        const original = (await vi.importActual('@sentry/bundler-plugins/vite')) as any;

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
          sourcemaps: {
            filesToDeleteAfterUpload,
          },
        },
        { getAdapterOutputDir: async () => '.svelte-kit/output', getKitConfig: async () => ({}) },
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
        release: {
          name: expect.any(String),
          inject: false,
        },
        sourcemaps: {
          filesToDeleteAfterUpload: expect.any(Promise),
          deleteSourcemapsAfterUpload: false,
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

      // @ts-expect-error this function exists!
      await filesToDeleteAfterUploadSettingPlugin.configResolved();

      await expect(mergedOptions.sourcemaps.filesToDeleteAfterUpload).resolves.toEqual(
        filesToDeleteAfterUploadExpected,
      );
    },
  );
});
