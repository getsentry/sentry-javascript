import type { Nitro, RollupConfig } from 'nitropack/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SentryNitroOptions } from '../../src/common/types';
import type { SourceMapSetting } from '../../src/rollup/setupSourceMaps';
import {
  changeNitroSourceMapSettings,
  getPluginOptions,
  validateNitroSourceMapSettings,
} from '../../src/rollup/setupSourceMaps';

vi.mock('@sentry/core', () => ({
  consoleSandbox: (callback: () => void) => callback(),
}));

describe('getPluginOptions', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = {};
  });

  it('uses environment variables as fallback when no moduleOptions are provided', () => {
    process.env = {
      SENTRY_ORG: 'default-org',
      SENTRY_PROJECT: 'default-project',
      SENTRY_AUTH_TOKEN: 'default-token',
      SENTRY_URL: 'https://santry.io',
    };

    const options = getPluginOptions({} as SentryNitroOptions);

    expect(options).toEqual(
      expect.objectContaining({
        org: 'default-org',
        project: 'default-project',
        authToken: 'default-token',
        url: 'https://santry.io',
        telemetry: true,
        sourcemaps: expect.objectContaining({
          rewriteSources: expect.any(Function),
        }),
        _metaOptions: expect.objectContaining({
          telemetry: expect.objectContaining({
            metaFramework: 'nuxt',
          }),
        }),
        debug: false,
      }),
    );
  });

  it('returns default options when no moduleOptions are provided', () => {
    const options = getPluginOptions({} as SentryNitroOptions);

    expect(options.org).toBeUndefined();
    expect(options.project).toBeUndefined();
    expect(options.authToken).toBeUndefined();
    expect(options).toEqual(
      expect.objectContaining({
        telemetry: true,
        sourcemaps: expect.objectContaining({
          rewriteSources: expect.any(Function),
        }),
        _metaOptions: expect.objectContaining({
          telemetry: expect.objectContaining({
            metaFramework: 'nuxt',
          }),
        }),
        debug: false,
      }),
    );
  });

  it('merges custom moduleOptions with default options', () => {
    const customOptions: SentryNitroOptions = {
      sourceMapsUploadOptions: {
        org: 'custom-org',
        project: 'custom-project',
        authToken: 'custom-token',
        telemetry: false,
        sourcemaps: {
          assets: ['custom-assets/**/*'],
          ignore: ['ignore-this.js'],
          filesToDeleteAfterUpload: ['delete-this.js'],
        },
      },
      debug: true,
    };
    const options = getPluginOptions(customOptions, false);
    expect(options).toEqual(
      expect.objectContaining({
        org: 'custom-org',
        project: 'custom-project',
        authToken: 'custom-token',
        telemetry: false,
        sourcemaps: expect.objectContaining({
          assets: ['custom-assets/**/*'],
          ignore: ['ignore-this.js'],
          filesToDeleteAfterUpload: ['delete-this.js'],
          rewriteSources: expect.any(Function),
        }),
        _metaOptions: expect.objectContaining({
          telemetry: expect.objectContaining({
            metaFramework: 'nuxt',
          }),
        }),
        debug: true,
      }),
    );
  });

  it('prioritizes new BuildTimeOptionsBase options over deprecated ones', () => {
    const options: SentryNitroOptions = {
      // New options
      org: 'new-org',
      project: 'new-project',
      authToken: 'new-token',
      sentryUrl: 'https://new.sentry.io',
      telemetry: false,
      silent: true,
      debug: true,
      sourcemaps: {
        assets: ['new-assets/**/*'],
        ignore: ['new-ignore.js'],
        filesToDeleteAfterUpload: ['new-delete.js'],
      },
      release: {
        name: 'test-release',
        create: false,
        finalize: true,
        dist: 'build-123',
        vcsRemote: 'upstream',
        setCommits: { auto: true },
        deploy: { env: 'production' },
      },
      bundleSizeOptimizations: { excludeTracing: true },

      // Deprecated options (should be ignored)
      sourceMapsUploadOptions: {
        org: 'old-org',
        project: 'old-project',
        authToken: 'old-token',
        url: 'https://old.sentry.io',
        telemetry: true,
        silent: false,
        sourcemaps: {
          assets: ['old-assets/**/*'],
          ignore: ['old-ignore.js'],
          filesToDeleteAfterUpload: ['old-delete.js'],
        },
        release: { name: 'old-release' },
      },
    };

    const result = getPluginOptions(options);

    expect(result).toMatchObject({
      org: 'new-org',
      project: 'new-project',
      authToken: 'new-token',
      url: 'https://new.sentry.io',
      telemetry: false,
      silent: true,
      debug: true,
      bundleSizeOptimizations: { excludeTracing: true },
      release: {
        name: 'test-release',
        create: false,
        finalize: true,
        dist: 'build-123',
        vcsRemote: 'upstream',
        setCommits: { auto: true },
        deploy: { env: 'production' },
      },
      sourcemaps: expect.objectContaining({
        assets: ['new-assets/**/*'],
        ignore: ['new-ignore.js'],
        filesToDeleteAfterUpload: ['new-delete.js'],
      }),
    });
  });

  it('falls back to deprecated options when new ones are undefined', () => {
    const options: SentryNitroOptions = {
      debug: true,
      sourceMapsUploadOptions: {
        org: 'deprecated-org',
        project: 'deprecated-project',
        authToken: 'deprecated-token',
        url: 'https://deprecated.sentry.io',
        telemetry: false,
        sourcemaps: {
          assets: ['deprecated/**/*'],
        },
        release: { name: 'deprecated-release' },
      },
    };

    const result = getPluginOptions(options);

    expect(result).toMatchObject({
      org: 'deprecated-org',
      project: 'deprecated-project',
      authToken: 'deprecated-token',
      url: 'https://deprecated.sentry.io',
      telemetry: false,
      debug: true,
      release: { name: 'deprecated-release' },
      sourcemaps: expect.objectContaining({
        assets: ['deprecated/**/*'],
      }),
    });
  });

  it('supports bundleSizeOptimizations', () => {
    const options: SentryNitroOptions = {
      bundleSizeOptimizations: {
        excludeDebugStatements: true,
        excludeTracing: true,
        excludeReplayShadowDom: true,
        excludeReplayIframe: true,
        excludeReplayWorker: true,
      },
    };

    const result = getPluginOptions(options);

    expect(result.bundleSizeOptimizations).toEqual({
      excludeDebugStatements: true,
      excludeTracing: true,
      excludeReplayShadowDom: true,
      excludeReplayIframe: true,
      excludeReplayWorker: true,
    });
  });

  it('merges with unstable_sentryBundlerPluginOptions correctly', () => {
    const options: SentryNitroOptions = {
      org: 'base-org',
      bundleSizeOptimizations: {
        excludeDebugStatements: false,
      },
      unstable_sentryBundlerPluginOptions: {
        org: 'override-org',
        release: { name: 'override-release' },
        sourcemaps: { assets: ['override/**/*'] },
        bundleSizeOptimizations: {
          excludeDebugStatements: true,
        },
      },
    };

    const result = getPluginOptions(options);

    expect(result).toMatchObject({
      org: 'override-org',
      release: { name: 'override-release' },
      sourcemaps: expect.objectContaining({
        assets: ['override/**/*'],
      }),
      bundleSizeOptimizations: {
        excludeDebugStatements: true,
      },
    });
  });

  it.each([
    {
      name: 'server fallback is true',
      serverFallback: true,
      customOptions: {},
      expectedFilesToDelete: ['.*/**/server/**/*.map', '.*/**/output/**/*.map', '.*/**/function/**/*.map'],
    },
    {
      name: 'no fallback, but custom filesToDeleteAfterUpload is provided (deprecated)',
      serverFallback: false,
      customOptions: {
        sourceMapsUploadOptions: {
          sourcemaps: { filesToDeleteAfterUpload: ['deprecated/path/**/*.map'] },
        },
      },
      expectedFilesToDelete: ['deprecated/path/**/*.map'],
    },
    {
      name: 'no fallback, but custom filesToDeleteAfterUpload is provided (new)',
      serverFallback: false,
      customOptions: {
        sourcemaps: { filesToDeleteAfterUpload: ['new-custom/path/**/*.map'] },
      },
      expectedFilesToDelete: ['new-custom/path/**/*.map'],
    },
    {
      name: 'no fallback, both source maps explicitly false and no custom filesToDeleteAfterUpload',
      serverFallback: false,
      customOptions: {},
      expectedFilesToDelete: undefined,
    },
  ])(
    'sets filesToDeleteAfterUpload correctly when $name',
    ({ serverFallback, customOptions, expectedFilesToDelete }) => {
      const options = getPluginOptions(customOptions as SentryNitroOptions, serverFallback);

      expect(options?.sourcemaps?.filesToDeleteAfterUpload).toEqual(expectedFilesToDelete);
    },
  );
});

describe('validate sourcemap settings', () => {
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  beforeEach(() => {
    consoleLogSpy.mockClear();
    consoleWarnSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('should handle nitroConfig.rollupConfig.output.sourcemap settings', () => {
    afterEach(() => {
      vi.clearAllMocks();
    });

    type MinimalNitroConfig = {
      sourceMap?: SourceMapSetting;
      rollupConfig?: RollupConfig;
    };

    const getNitroConfig = (
      nitroSourceMap?: SourceMapSetting,
      rollupSourceMap?: SourceMapSetting,
    ): MinimalNitroConfig => ({
      sourceMap: nitroSourceMap,
      rollupConfig: { output: { sourcemap: rollupSourceMap } },
    });

    it('should log a warning when Nitro and Rollup source map settings differ', () => {
      const nitroConfig = getNitroConfig(true, false);

      validateNitroSourceMapSettings(nitroConfig, { debug: true });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[Sentry] Source map generation settings are conflicting. Sentry uses `sourceMap: true`. However, a conflicting setting was discovered (`rollupConfig.output.sourcemap: false`). This setting was probably explicitly set in your configuration. Sentry won't override this setting but it may affect source maps generation and upload. Without source maps, code snippets on the Sentry Issues page will remain minified.",
      );
    });

    it('should set sourcemapExcludeSources to false', () => {
      const nitroConfig = getNitroConfig(true);
      validateNitroSourceMapSettings(nitroConfig, { debug: true });

      expect(nitroConfig?.rollupConfig?.output?.sourcemapExcludeSources).toBe(false);
    });

    it('should not show console.warn when rollup sourcemap is undefined', () => {
      const nitroConfig = getNitroConfig(true);

      validateNitroSourceMapSettings(nitroConfig, { debug: true });

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });
});

describe('change Nuxt source map settings', () => {
  let nitro: Nitro;
  let sentryModuleOptions: SentryNitroOptions;

  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  beforeEach(() => {
    consoleLogSpy.mockClear();

    // @ts-expect-error - Nitro types don't accept `undefined` but we want to test this case
    nitro = { options: { sourceMap: undefined } };
    sentryModuleOptions = {};
  });

  it.each([
    { serverSourcemap: false, expectedSourcemap: false, expectedReturn: 'disabled' },
    { serverSourcemap: 'hidden', expectedSourcemap: 'hidden', expectedReturn: 'enabled' },
    { serverSourcemap: true, expectedSourcemap: true, expectedReturn: 'enabled' },
    { serverSourcemap: undefined, expectedSourcemap: 'hidden', expectedReturn: 'unset' },
  ])(
    'should handle server sourcemap setting: $serverSourcemap',
    ({ serverSourcemap, expectedSourcemap, expectedReturn }) => {
      // @ts-expect-error server available
      nitro.options.sourceMap = serverSourcemap;
      const previousUserSourcemapSetting = changeNitroSourceMapSettings(nitro, sentryModuleOptions);
      expect(nitro.options.sourceMap).toBe(expectedSourcemap);
      expect(previousUserSourcemapSetting).toBe(expectedReturn);
    },
  );

  it("sets sourceMap to 'hidden' if nitro.options.sourceMap not set", () => {
    // @ts-expect-error - Nitro types don't accept `undefined` but we want to test this case
    nitro.options.sourceMap = undefined;
    const previousUserSourcemapSetting = changeNitroSourceMapSettings(nitro, sentryModuleOptions);
    expect(nitro.options.sourceMap).toBe('hidden');
    expect(previousUserSourcemapSetting).toBe('unset');
  });

  it('should log a message when source maps are enabled and debug is true', () => {
    const settingKey = 'sourceMap';
    const settingValue = 'hidden';

    nitro.options.sourceMap = settingValue;

    changeNitroSourceMapSettings(nitro, { debug: true });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      `[Sentry] \`${settingKey}\` is enabled with \`${settingValue}\`. This will correctly un-minify the code snippet on the Sentry Issue Details page.`,
    );
  });

  it('should not log a message when source maps are defined and debug is false', () => {
    nitro.options.sourceMap = false;

    const previousUserSourcemapSetting = changeNitroSourceMapSettings(nitro, { debug: false });

    expect(nitro.options.sourceMap).toBe(false);
    expect(previousUserSourcemapSetting).toBe('disabled');

    expect(consoleLogSpy).not.toHaveBeenCalled();
  });
});
