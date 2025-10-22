import type { Nuxt } from '@nuxt/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SentryNuxtModuleOptions } from '../../src/common/types';
import { changeNuxtClientSourceMapSettings, getPluginOptions } from '../../src/vite/sourceMaps';

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
    const options = getPluginOptions(customOptions, true);
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
      name: 'client fallback is true',
      shouldDeleteClientFiles: true,
      customOptions: {},
      expectedFilesToDelete: ['.*/**/public/**/*.map'],
    },
    {
      name: 'client fallback is false',
      shouldDeleteClientFiles: false,
      customOptions: {},
      expectedFilesToDelete: undefined,
    },
    {
      name: 'no fallback, but custom filesToDeleteAfterUpload is provided (deprecated)',
      shouldDeleteClientFiles: false,
      customOptions: {
        sourceMapsUploadOptions: {
          sourcemaps: { filesToDeleteAfterUpload: ['deprecated/path/**/*.map'] },
        },
      },
      expectedFilesToDelete: ['deprecated/path/**/*.map'],
    },
    {
      name: 'no fallback, but custom filesToDeleteAfterUpload is provided (new)',
      shouldDeleteClientFiles: false,
      customOptions: {
        sourcemaps: { filesToDeleteAfterUpload: ['new-custom/path/**/*.map'] },
      },
      expectedFilesToDelete: ['new-custom/path/**/*.map'],
    },
    {
      name: 'fallback is true, but custom filesToDeleteAfterUpload overrides',
      shouldDeleteClientFiles: true,
      customOptions: {
        sourcemaps: { filesToDeleteAfterUpload: ['custom/path/**/*.map'] },
      },
      expectedFilesToDelete: ['custom/path/**/*.map'],
    },
  ])(
    'sets filesToDeleteAfterUpload correctly when $name',
    ({ shouldDeleteClientFiles, customOptions, expectedFilesToDelete }) => {
      const options = getPluginOptions(customOptions as SentryNuxtModuleOptions, shouldDeleteClientFiles);

      expect(options?.sourcemaps?.filesToDeleteAfterUpload).toEqual(expectedFilesToDelete);
    },
  );
});

describe('change Nuxt client source map settings', () => {
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
      const previousUserSourcemapSetting = changeNuxtClientSourceMapSettings(nuxt as Nuxt, sentryModuleOptions);
      expect(nuxt.options.sourcemap.client).toBe(expectedSourcemap);
      expect(previousUserSourcemapSetting).toBe(expectedReturn);
    },
  );

  describe('should handle nuxt.options.sourcemap as a boolean', () => {
    it.each([
      { sourcemap: false, expectedClientSourcemap: false, expectedReturn: 'disabled' },
      { sourcemap: true, expectedClientSourcemap: true, expectedReturn: 'enabled' },
      { sourcemap: 'hidden', expectedClientSourcemap: 'hidden', expectedReturn: 'enabled' },
    ])(
      'converts global setting to object and sets client: $sourcemap',
      ({ sourcemap, expectedClientSourcemap, expectedReturn }) => {
        // @ts-expect-error string type is possible in Nuxt (but type says differently)
        nuxt.options.sourcemap = sourcemap;
        const previousUserSourcemapSetting = changeNuxtClientSourceMapSettings(nuxt as Nuxt, { debug: true });

        expect(nuxt.options.sourcemap.client).toBe(expectedClientSourcemap);
        expect(previousUserSourcemapSetting).toBe(expectedReturn);
      },
    );

    it("sets client to 'hidden' if nuxt.options.sourcemap not set, server is also set to 'hidden'", () => {
      // @ts-expect-error - Nuxt types don't accept `undefined` but we want to test this case
      nuxt.options.sourcemap = undefined;
      const previousUserSourcemapSetting = changeNuxtClientSourceMapSettings(nuxt as Nuxt, sentryModuleOptions);
      expect(nuxt.options.sourcemap.client).toBe('hidden');
      // Server is also set to 'hidden' to maintain a valid Nuxt config object structure
      // but server-side source maps are actually handled by Nitro SDK
      expect(nuxt.options.sourcemap.server).toBe('hidden');
      expect(previousUserSourcemapSetting).toBe('unset');
    });

    it('should log a message when source maps are enabled and debug is true', () => {
      const settingKey = 'sourcemap.client';
      const settingValue = 'hidden';

      nuxt.options.sourcemap.client = settingValue;

      changeNuxtClientSourceMapSettings(nuxt as Nuxt, { debug: true });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        `[Sentry] \`${settingKey}\` is enabled with \`${settingValue}\`. This will correctly un-minify the code snippet on the Sentry Issue Details page.`,
      );
    });

    it('should log a message when client source maps are unset', () => {
      const clientSetting = changeNuxtClientSourceMapSettings(nuxt as Nuxt, { debug: true });

      expect(clientSetting).toBe('unset');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Sentry] Enabled source map generation in the build options with `sourcemap.client: hidden`.',
      );
    });

    it('should not log a message when client source maps are defined and debug is false', () => {
      nuxt.options.sourcemap.client = false;

      const clientSetting = changeNuxtClientSourceMapSettings(nuxt as Nuxt, { debug: false });

      expect(clientSetting).toBe('disabled');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });
});
