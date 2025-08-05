import type { Nuxt } from '@nuxt/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SentryNuxtModuleOptions } from '../../src/common/types';
import type { SourceMapSetting } from '../../src/vite/sourceMaps';
import {
  changeNuxtSourceMapSettings,
  getPluginOptions,
  validateNitroSourceMapSettings,
} from '../../src/vite/sourceMaps';

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

  it('prioritizes new BuildTimeOptionsBase options over deprecated ones', () => {
    const options: SentryNuxtModuleOptions = {
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
    const options: SentryNuxtModuleOptions = {
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
    const options: SentryNuxtModuleOptions = {
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
    const options: SentryNuxtModuleOptions = {
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
      name: 'both client and server fallback are true',
      clientFallback: true,
      serverFallback: true,
      customOptions: {},
      expectedFilesToDelete: [
        '.*/**/public/**/*.map',
        '.*/**/server/**/*.map',
        '.*/**/output/**/*.map',
        '.*/**/function/**/*.map',
      ],
    },
    {
      name: 'only client fallback is true',
      clientFallback: true,
      serverFallback: false,
      customOptions: {},
      expectedFilesToDelete: ['.*/**/public/**/*.map'],
    },
    {
      name: 'only server fallback is true',
      clientFallback: false,
      serverFallback: true,
      customOptions: {},
      expectedFilesToDelete: ['.*/**/server/**/*.map', '.*/**/output/**/*.map', '.*/**/function/**/*.map'],
    },
    {
      name: 'no fallback, but custom filesToDeleteAfterUpload is provided (deprecated)',
      clientFallback: false,
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
      clientFallback: false,
      serverFallback: false,
      customOptions: {
        sourcemaps: { filesToDeleteAfterUpload: ['new-custom/path/**/*.map'] },
      },
      expectedFilesToDelete: ['new-custom/path/**/*.map'],
    },
    {
      name: 'no fallback, both source maps explicitly false and no custom filesToDeleteAfterUpload',
      clientFallback: false,
      serverFallback: false,
      customOptions: {},
      expectedFilesToDelete: undefined,
    },
  ])(
    'sets filesToDeleteAfterUpload correctly when $name',
    ({ clientFallback, serverFallback, customOptions, expectedFilesToDelete }) => {
      const options = getPluginOptions(customOptions as SentryNuxtModuleOptions, {
        client: clientFallback,
        server: serverFallback,
      });

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

  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  beforeEach(() => {
    consoleLogSpy.mockClear();

    // @ts-expect-error - Nuxt types don't accept `undefined` but we want to test this case
    nuxt = { options: { sourcemap: { client: undefined } } };
    sentryModuleOptions = {};
  });

  it.each([
    { clientSourcemap: false, expectedSourcemap: false, expectedReturn: 'disabled' },
    { clientSourcemap: 'hidden', expectedSourcemap: 'hidden', expectedReturn: 'enabled' },
    { clientSourcemap: true, expectedSourcemap: true, expectedReturn: 'enabled' },
    { clientSourcemap: undefined, expectedSourcemap: 'hidden', expectedReturn: 'unset' },
  ])(
    'should handle client sourcemap setting: $clientSourcemap',
    ({ clientSourcemap, expectedSourcemap, expectedReturn }) => {
      // @ts-expect-error - Nuxt types don't accept `undefined` but we want to test this case
      nuxt.options.sourcemap.client = clientSourcemap;
      const previousUserSourcemapSetting = changeNuxtSourceMapSettings(nuxt as Nuxt, sentryModuleOptions);
      expect(nuxt.options.sourcemap.client).toBe(expectedSourcemap);
      expect(previousUserSourcemapSetting.client).toBe(expectedReturn);
    },
  );

  it.each([
    { serverSourcemap: false, expectedSourcemap: false, expectedReturn: 'disabled' },
    { serverSourcemap: 'hidden', expectedSourcemap: 'hidden', expectedReturn: 'enabled' },
    { serverSourcemap: true, expectedSourcemap: true, expectedReturn: 'enabled' },
    { serverSourcemap: undefined, expectedSourcemap: 'hidden', expectedReturn: 'unset' },
  ])(
    'should handle server sourcemap setting: $serverSourcemap',
    ({ serverSourcemap, expectedSourcemap, expectedReturn }) => {
      // @ts-expect-error server available
      nuxt.options.sourcemap.server = serverSourcemap;
      const previousUserSourcemapSetting = changeNuxtSourceMapSettings(nuxt as Nuxt, sentryModuleOptions);
      expect(nuxt.options.sourcemap.server).toBe(expectedSourcemap);
      expect(previousUserSourcemapSetting.server).toBe(expectedReturn);
    },
  );

  describe('should handle nuxt.options.sourcemap as a boolean', () => {
    it.each([
      { sourcemap: false, expectedSourcemap: false, expectedReturn: 'disabled' },
      { sourcemap: true, expectedSourcemap: true, expectedReturn: 'enabled' },
      { sourcemap: 'hidden', expectedSourcemap: 'hidden', expectedReturn: 'enabled' },
    ])('keeps nuxt.options.sourcemap setting: $sourcemap', ({ sourcemap, expectedSourcemap, expectedReturn }) => {
      // @ts-expect-error string type is possible in Nuxt (but type says differently)
      nuxt.options.sourcemap = sourcemap;
      const previousUserSourcemapSetting = changeNuxtSourceMapSettings(nuxt as Nuxt, { debug: true });

      expect(nuxt.options.sourcemap).toBe(expectedSourcemap);
      expect(previousUserSourcemapSetting.client).toBe(expectedReturn);
      expect(previousUserSourcemapSetting.server).toBe(expectedReturn);
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

    it('should log a message when source maps are enabled and debug is true', () => {
      const settingKey = 'sourcemap.client';
      const settingValue = 'hidden';

      nuxt.options.sourcemap.client = settingValue;

      changeNuxtSourceMapSettings(nuxt as Nuxt, { debug: true });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        `[Sentry] \`${settingKey}\` is enabled with \`${settingValue}\`. This will correctly un-minify the code snippet on the Sentry Issue Details page.`,
      );
    });

    it('should log a message when one of the source maps are unset', () => {
      nuxt.options.sourcemap.server = true;

      const { client, server } = changeNuxtSourceMapSettings(nuxt as Nuxt, { debug: true });

      expect(client).toBe('unset');
      expect(server).toBe('enabled');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Sentry] Enabled source map generation in the build options with `sourcemap.client: hidden`.',
      );
    });

    it('should not log a message when client/server source maps are defined and debug is false', () => {
      nuxt.options.sourcemap.client = false;
      nuxt.options.sourcemap.server = true;

      const { client, server } = changeNuxtSourceMapSettings(nuxt as Nuxt, { debug: false });

      expect(client).toBe('disabled');
      expect(server).toBe('enabled');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });
});
