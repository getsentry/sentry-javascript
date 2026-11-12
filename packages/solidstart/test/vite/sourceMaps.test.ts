import type { SentryVitePluginInternalOptions } from '@sentry/bundler-plugins/vite';
import type { Plugin, UserConfig } from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sentrySolidStart } from '../../src/vite/sentrySolidStart';
import { sentrySolidStartVite } from '../../src/vite/sentrySolidStartVite';
import type { SourceMapState } from '../../src/vite/sourceMaps';
import {
  getUpdatedSourceMapSettings,
  makeAddSentryVitePlugin,
  makeAddSentryVitePluginSolidStart2,
  makeEnableSourceMapsVitePlugin,
} from '../../src/vite/sourceMaps';

let lastPluginOptions: SentryVitePluginInternalOptions | undefined;

/** What the options returned when the mocked Sentry plugin's `config` hook ran. */
let optionsAtSentryConfigHook: { deletion?: boolean; sdkEnabled?: boolean } | undefined;

const sentryVitePluginSpy = vi.fn((options: SentryVitePluginInternalOptions): Plugin[] => {
  lastPluginOptions = options;
  return [
    {
      name: 'sentry-vite-debug-id-upload-plugin',
      config() {
        optionsAtSentryConfigHook = { deletion: getDeleteOption(), sdkEnabled: getSdkEnabledOption() };
      },
    },
  ];
});

/** Runs each plugin's `config` hook in order over one config, merging `build` the way Vite does. */
function runConfigHooks(plugins: Plugin[], config: UserConfig): UserConfig {
  for (const plugin of plugins) {
    const hook = plugin.config;
    const handler = typeof hook === 'function' ? hook : hook?.handler;
    const contributed = handler?.call({} as never, config, { command: 'build', mode: 'production' }) as
      | UserConfig
      | undefined;
    if (contributed?.build) {
      config.build = { ...config.build, ...contributed.build };
    }
  }
  return config;
}

function getDeleteOption(environment?: string): boolean | undefined {
  const value = lastPluginOptions?.sourcemaps?.deleteSourcemapsAfterUpload;
  return typeof value === 'function' ? value(environment) : value;
}

function getSdkEnabledOption(environment?: string): boolean | undefined {
  const value = lastPluginOptions?.sourcemaps?.sdkEnabledSourceMaps;
  return typeof value === 'function' ? value(environment) : value;
}

vi.mock('@sentry/bundler-plugins/vite', async () => {
  const original = (await vi.importActual('@sentry/bundler-plugins/vite')) as any;

  return {
    ...original,
    sentryVitePlugin: (options: SentryVitePluginInternalOptions) => sentryVitePluginSpy(options),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  optionsAtSentryConfigHook = undefined;
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

  // Vite concatenates arrays when merging, so echoing the config back duplicates the user's arrays.
  it('contributes only the source map setting, not the whole config back', () => {
    const plugin = makeEnableSourceMapsVitePlugin({})[0]!;
    const hook = plugin.config;
    const handler = typeof hook === 'function' ? hook : hook?.handler;

    const contributed = handler?.call(
      {} as never,
      { optimizeDeps: { include: ['x'] } },
      {
        command: 'build',
        mode: 'production',
      },
    );

    expect(contributed).toEqual({ build: { sourcemap: 'hidden' } });
  });

  it('records that it enabled source maps', () => {
    const state: SourceMapState = { sdkEnabledSourceMaps: false };

    runConfigHooks(makeEnableSourceMapsVitePlugin({}, state), {});

    expect(state.sdkEnabledSourceMaps).toBe(true);
  });

  it.each([['hidden'], ['inline'], [true], [false]] as const)(
    'does not record a `%s` setting the user made',
    setting => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const state: SourceMapState = { sdkEnabledSourceMaps: true };

      runConfigHooks(makeEnableSourceMapsVitePlugin({}, state), { build: { sourcemap: setting } });

      expect(state.sdkEnabledSourceMaps).toBe(false);
    },
  );
});

describe('makeAddSentryVitePlugin()', () => {
  it('passes user-specified vite plugin options to vite plugin', () => {
    makeAddSentryVitePlugin({
      org: 'my-org',
      authToken: 'my-token',
      applicationKey: 'my-app-key',
      sentryUrl: 'https://my.sentry.io',
      moduleMetadata: { team: 'sdk' },
      sourcemaps: {
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
        applicationKey: 'my-app-key',
        // `sentryUrl` is resolved to the plugin's `url` option
        url: 'https://my.sentry.io',
        moduleMetadata: { team: 'sdk' },
        sourcemaps: {
          filesToDeleteAfterUpload: ['baz/*.js'],
          deleteSourcemapsAfterUpload: expect.any(Function),
          sdkEnabledSourceMaps: expect.any(Function),
        },
        bundleSizeOptimizations: {
          excludeTracing: true,
        },
      }),
    );
  });
});

describe('makeAddSentryVitePluginSolidStart2()', () => {
  it('passes the shared build-time options through to the vite plugin', () => {
    makeAddSentryVitePluginSolidStart2({
      org: 'my-org',
      project: 'my-project',
      authToken: 'my-token',
      sentryUrl: 'https://my-sentry.io',
      applicationKey: 'my-app',
      silent: true,
      bundleSizeOptimizations: { excludeTracing: true },
    });

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        org: 'my-org',
        project: 'my-project',
        authToken: 'my-token',
        // `sentryUrl` is spelled `url` on the plugin.
        url: 'https://my-sentry.io',
        applicationKey: 'my-app',
        silent: true,
        bundleSizeOptimizations: { excludeTracing: true },
      }),
    );
  });

  // `buildTimeInstrumentation` configures the orchestrion plugin, not the bundler plugin.
  it('does not forward `buildTimeInstrumentation` to the vite plugin', () => {
    makeAddSentryVitePluginSolidStart2({ org: 'my-org', buildTimeInstrumentation: false });

    expect(sentryVitePluginSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ buildTimeInstrumentation: expect.anything() }),
    );
  });

  it('always tags telemetry as solidstart', () => {
    makeAddSentryVitePluginSolidStart2({ org: 'my-org' });

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        _metaOptions: { telemetry: { metaFramework: 'solidstart' } },
      }),
    );
  });

  it('warns when the removed `unstable_sentryVitePluginOptions` is still set', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // @ts-expect-error - removed in v11, but JS configs get no type checking
    sentrySolidStart({ unstable_sentryVitePluginOptions: { org: 'other-org' } });

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('unstable_sentryVitePluginOptions'));

    consoleWarnSpy.mockRestore();
  });
});

describe.each([
  ['makeAddSentryVitePlugin', makeAddSentryVitePlugin],
  ['makeAddSentryVitePluginSolidStart2', makeAddSentryVitePluginSolidStart2],
] as const)('%s() source map deletion', (_name, makePlugin) => {
  it('asks for deletion once the SDK enabled the source maps', () => {
    const state: SourceMapState = { sdkEnabledSourceMaps: false };
    makePlugin({}, state);

    expect(getDeleteOption()).toBeUndefined();
    state.sdkEnabledSourceMaps = true;
    expect(getDeleteOption()).toBe(true);
  });

  it.each([true, false])('passes a user-set `deleteSourcemapsAfterUpload: %s` through', value => {
    makePlugin({ sourcemaps: { deleteSourcemapsAfterUpload: value } }, { sdkEnabledSourceMaps: !value });

    expect(getDeleteOption()).toBe(value);
  });

  it('asks for deletion next to a user-set `filesToDeleteAfterUpload`', () => {
    makePlugin({ sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] } }, { sdkEnabledSourceMaps: true });

    expect(lastPluginOptions?.sourcemaps?.filesToDeleteAfterUpload).toEqual(['./dist/**/*.map']);
    expect(getDeleteOption()).toBe(true);
  });

  // Nitro gives its environments their own `build.sourcemap`, and `@sentry/nitro` reads those
  // maps after the build.
  it.each([
    [undefined, true, true],
    ['nitro', undefined, false],
    ['ssr', undefined, false],
  ])('answers for the `%s` environment', (environment, deletion, sdkEnabled) => {
    makePlugin({}, { sdkEnabledSourceMaps: true });

    expect(getDeleteOption(environment)).toBe(deletion);
    expect(getSdkEnabledOption(environment)).toBe(sdkEnabled);
  });

  it.each([undefined, 'nitro', 'ssr'])(
    'passes a user-set `deleteSourcemapsAfterUpload` to the `%s` environment',
    environment => {
      makePlugin({ sourcemaps: { deleteSourcemapsAfterUpload: true } }, { sdkEnabledSourceMaps: true });

      expect(getDeleteOption(environment)).toBe(true);
    },
  );

  // Makes the plugin remove all of the maps, also those a user's `assets` or `ignore` leave out.
  it('tells the bundler plugin whether the SDK enabled the source maps', () => {
    const state: SourceMapState = { sdkEnabledSourceMaps: false };
    makePlugin({ sourcemaps: { assets: ['./dist/client/**'] } }, state);

    expect(getSdkEnabledOption()).toBe(false);
    state.sdkEnabledSourceMaps = true;
    expect(getSdkEnabledOption()).toBe(true);
    expect(getDeleteOption()).toBe(true);
  });
});

it('makeAddSentryVitePlugin() asks for deletion when only the upload is disabled', () => {
  makeAddSentryVitePlugin({ sourcemaps: { disable: 'disable-upload' } }, { sdkEnabledSourceMaps: true });

  expect(getDeleteOption()).toBe(true);
  expect(getSdkEnabledOption()).toBe(true);
});

it('makeAddSentryVitePluginSolidStart2() keeps the source maps when only the upload is disabled', () => {
  makeAddSentryVitePluginSolidStart2({ sourcemaps: { disable: 'disable-upload' } }, { sdkEnabledSourceMaps: true });

  expect(getDeleteOption()).toBeUndefined();
});

// Vinxi passes its router to every SolidStart 1 `config` hook.
const vinxiClientConfig = { router: { target: 'client', name: 'client', root: '.' } } as UserConfig;

// The bundler plugin reads the option when its own `config` hook runs, which comes after ours.
describe.each([
  ['sentrySolidStart', () => sentrySolidStart()],
  ['sentrySolidStartVite', () => sentrySolidStartVite()],
] as const)('%s() in plugin order', (_name, getPlugins) => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('enables hidden source maps and asks the bundler plugin to delete them', () => {
    const config = runConfigHooks(getPlugins(), { ...vinxiClientConfig });

    expect(config.build?.sourcemap).toBe('hidden');
    expect(optionsAtSentryConfigHook).toEqual({ deletion: true, sdkEnabled: true });
  });

  it('keeps source maps the user enabled', () => {
    const config = runConfigHooks(getPlugins(), { ...vinxiClientConfig, build: { sourcemap: 'hidden' } });

    expect(config.build?.sourcemap).toBe('hidden');
    expect(optionsAtSentryConfigHook).toEqual({ deletion: undefined, sdkEnabled: false });
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
