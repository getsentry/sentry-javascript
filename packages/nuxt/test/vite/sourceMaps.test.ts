import type { Nuxt } from '@nuxt/schema';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { SentryNuxtModuleOptions } from '../../src/common/types';
import type { SourceMapSetting } from '../../src/vite/sourceMaps';
import {
  changeNuxtSourceMapSettings,
  validateNitroSourceMapSettings,
  getPluginOptions,
} from '../../src/vite/sourceMaps';

vi.mock('@sentry/core', () => ({
  consoleSandbox: (callback: () => void) => callback(),
}));

describe('getPluginOptions', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = {};
  });

  it('uses environment variables when no moduleOptions are provided', () => {
    const defaultEnv = {
      SENTRY_ORG: 'default-org',
      SENTRY_PROJECT: 'default-project',
      SENTRY_AUTH_TOKEN: 'default-token',
      SENTRY_URL: 'https://santry.io',
    };

    process.env = { ...defaultEnv };

    const options = getPluginOptions({} as SentryNuxtModuleOptions);

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
    const options = getPluginOptions({} as SentryNuxtModuleOptions);

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
    const customOptions: SentryNuxtModuleOptions = {
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
    const options = getPluginOptions(customOptions, { client: true, server: false });
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

  it('overrides options that were undefined with options from unstable_sentryRollupPluginOptions', () => {
    const customOptions: SentryNuxtModuleOptions = {
      sourceMapsUploadOptions: {
        org: 'custom-org',
        project: 'custom-project',
        sourcemaps: {
          assets: ['custom-assets/**/*'],
          filesToDeleteAfterUpload: ['delete-this.js'],
        },
        url: 'https://santry.io',
      },
      debug: true,
      unstable_sentryBundlerPluginOptions: {
        org: 'unstable-org',
        sourcemaps: {
          assets: ['unstable-assets/**/*'],
        },
        release: {
          name: 'test-release',
        },
        url: 'https://suntry.io',
      },
    };
    const options = getPluginOptions(customOptions);
    expect(options).toEqual(
      expect.objectContaining({
        debug: true,
        org: 'unstable-org',
        project: 'custom-project',
        sourcemaps: expect.objectContaining({
          assets: ['unstable-assets/**/*'],
          filesToDeleteAfterUpload: ['delete-this.js'],
          rewriteSources: expect.any(Function),
        }),
        release: expect.objectContaining({
          name: 'test-release',
        }),
        url: 'https://suntry.io',
      }),
    );
  });

  it('sets filesToDeleteAfterUpload correctly based on fallback options', () => {
    // Scenario 1: Both client and server fallback are true
    const optionsBothTrue = getPluginOptions({}, { client: true, server: true });
    expect(optionsBothTrue?.sourcemaps?.filesToDeleteAfterUpload).toEqual([
      '.*/**/public/**/*.map',
      '.*/**/server/**/*.map',
      '.*/**/output/**/*.map',
      '.*/**/function/**/*.map',
    ]);

    // Scenario 2: Only client fallback is true
    const optionsClientTrue = getPluginOptions({}, { client: true, server: false });
    expect(optionsClientTrue?.sourcemaps?.filesToDeleteAfterUpload).toEqual(['.*/**/public/**/*.map']);

    // Scenario 3: Only server fallback is true
    const optionsServerTrue = getPluginOptions({}, { client: false, server: true });
    expect(optionsServerTrue?.sourcemaps?.filesToDeleteAfterUpload).toEqual([
      '.*/**/server/**/*.map',
      '.*/**/output/**/*.map',
      '.*/**/function/**/*.map',
    ]);

    // Scenario 4: No fallback, but custom filesToDeleteAfterUpload is provided
    const customDeleteFiles = ['custom/path/**/*.map'];
    const optionsWithCustomDelete = getPluginOptions(
      {
        sourceMapsUploadOptions: {
          sourcemaps: {
            filesToDeleteAfterUpload: customDeleteFiles,
          },
        },
      },
      { client: false, server: false },
    );
    expect(optionsWithCustomDelete?.sourcemaps?.filesToDeleteAfterUpload).toEqual(customDeleteFiles);

    // Scenario 5: No fallback, both source maps explicitly false and no custom filesToDeleteAfterUpload
    const optionsNoDelete = getPluginOptions({}, { client: false, server: false });
    expect(optionsNoDelete?.sourcemaps?.filesToDeleteAfterUpload).toBeUndefined();
  });
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
      rollupConfig?: {
        output?: { sourcemap?: SourceMapSetting; sourcemapExcludeSources?: boolean };
      };
    };
    type MinimalNuxtConfig = {
      options: { sourcemap?: SourceMapSetting | { server?: SourceMapSetting; client?: SourceMapSetting } };
    };

    const getNitroConfig = (
      nitroSourceMap?: SourceMapSetting,
      rollupSourceMap?: SourceMapSetting,
    ): MinimalNitroConfig => ({
      sourceMap: nitroSourceMap,
      rollupConfig: { output: { sourcemap: rollupSourceMap } },
    });

    const getNuxtConfig = (nuxtSourceMap?: SourceMapSetting): MinimalNuxtConfig => ({
      options: { sourcemap: { server: nuxtSourceMap } },
    });

    it('should log a warning when Nuxt and Nitro source map settings differ', () => {
      const nuxt = getNuxtConfig(true);
      const nitroConfig = getNitroConfig(false);

      validateNitroSourceMapSettings(nuxt, nitroConfig, { debug: true });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[Sentry] Source map generation settings are conflicting. Sentry uses `sourcemap.server: true`. However, a conflicting setting was discovered (`nitro.sourceMap: false`). This setting was probably explicitly set in your configuration. Sentry won't override this setting but it may affect source maps generation and upload. Without source maps, code snippets on the Sentry Issues page will remain minified.",
      );
    });

    it('should set sourcemapExcludeSources to false', () => {
      const nitroConfig = getNitroConfig(true);
      validateNitroSourceMapSettings(getNuxtConfig(true), nitroConfig, { debug: true });

      expect(nitroConfig?.rollupConfig?.output?.sourcemapExcludeSources).toBe(false);
    });

    it('should not show console.warn when rollup sourcemap is undefined', () => {
      const nitroConfig = getNitroConfig(true);

      validateNitroSourceMapSettings(getNuxtConfig(true), nitroConfig, { debug: true });

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });
});

describe('change Nuxt source map settings', () => {
  let nuxt: { options: { sourcemap: { client: boolean | 'hidden'; server: boolean | 'hidden' } } };
  let sentryModuleOptions: SentryNuxtModuleOptions;

  beforeEach(() => {
    // @ts-expect-error - Nuxt types don't accept `undefined` but we want to test this case
    nuxt = { options: { sourcemap: { client: undefined } } };
    sentryModuleOptions = {};
  });

  it('should handle nuxt.options.sourcemap.client settings', () => {
    const cases = [
      { clientSourcemap: false, expectedSourcemap: false, expectedReturn: 'disabled' },
      { clientSourcemap: 'hidden', expectedSourcemap: 'hidden', expectedReturn: 'enabled' },
      { clientSourcemap: true, expectedSourcemap: true, expectedReturn: 'enabled' },
      { clientSourcemap: undefined, expectedSourcemap: 'hidden', expectedReturn: 'unset' },
    ];

    cases.forEach(({ clientSourcemap, expectedSourcemap, expectedReturn }) => {
      // @ts-expect-error - Nuxt types don't accept `undefined` but we want to test this case
      nuxt.options.sourcemap.client = clientSourcemap;
      const previousUserSourcemapSetting = changeNuxtSourceMapSettings(nuxt as Nuxt, sentryModuleOptions);
      expect(nuxt.options.sourcemap.client).toBe(expectedSourcemap);
      expect(previousUserSourcemapSetting.client).toBe(expectedReturn);
    });
  });

  it('should handle nuxt.options.sourcemap.server settings', () => {
    const cases = [
      { serverSourcemap: false, expectedSourcemap: false, expectedReturn: 'disabled' },
      { serverSourcemap: 'hidden', expectedSourcemap: 'hidden', expectedReturn: 'enabled' },
      { serverSourcemap: true, expectedSourcemap: true, expectedReturn: 'enabled' },
      { serverSourcemap: undefined, expectedSourcemap: 'hidden', expectedReturn: 'unset' },
    ];

    cases.forEach(({ serverSourcemap, expectedSourcemap, expectedReturn }) => {
      // @ts-expect-error server available
      nuxt.options.sourcemap.server = serverSourcemap;
      const previousUserSourcemapSetting = changeNuxtSourceMapSettings(nuxt as Nuxt, sentryModuleOptions);
      expect(nuxt.options.sourcemap.server).toBe(expectedSourcemap);
      expect(previousUserSourcemapSetting.server).toBe(expectedReturn);
    });
  });

  describe('should handle nuxt.options.sourcemap as a boolean', () => {
    it('keeps setting of nuxt.options.sourcemap if it is set', () => {
      const cases = [
        { sourcemap: false, expectedSourcemap: false, expectedReturn: 'disabled' },
        { sourcemap: true, expectedSourcemap: true, expectedReturn: 'enabled' },
        { sourcemap: 'hidden', expectedSourcemap: 'hidden', expectedReturn: 'enabled' },
      ];

      cases.forEach(({ sourcemap, expectedSourcemap, expectedReturn }) => {
        // @ts-expect-error string type is possible in Nuxt (but type says differently)
        nuxt.options.sourcemap = sourcemap;
        const previousUserSourcemapSetting = changeNuxtSourceMapSettings(nuxt as Nuxt, sentryModuleOptions);
        expect(nuxt.options.sourcemap).toBe(expectedSourcemap);
        expect(previousUserSourcemapSetting.client).toBe(expectedReturn);
        expect(previousUserSourcemapSetting.server).toBe(expectedReturn);
      });
    });

    it("sets client and server to 'hidden' if nuxt.options.sourcemap not set", () => {
      // @ts-expect-error - Nuxt types don't accept `undefined` but we want to test this case
      nuxt.options.sourcemap = undefined;
      const previousUserSourcemapSetting = changeNuxtSourceMapSettings(nuxt as Nuxt, sentryModuleOptions);
      expect(nuxt.options.sourcemap.client).toBe('hidden');
      expect(nuxt.options.sourcemap.server).toBe('hidden');
      expect(previousUserSourcemapSetting.client).toBe('unset');
      expect(previousUserSourcemapSetting.server).toBe('unset');
    });
  });
});
