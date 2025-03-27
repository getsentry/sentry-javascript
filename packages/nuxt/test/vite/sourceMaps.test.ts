import type { Nuxt } from '@nuxt/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SentryNuxtModuleOptions } from '../../src/common/types';
import type { SourceMapSetting, UserSourceMapSetting } from '../../src/vite/sourceMaps';
import { getNuxtSourceMapSetting } from '../../src/vite/sourceMaps';
import {
  changeNuxtSourceMapSettings,
  changeNitroSourceMapSettings,
  getViteSourceMapSettingDefinition,
  getPluginOptions,
} from '../../src/vite/sourceMaps';

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

    const options = getPluginOptions({} as SentryNuxtModuleOptions, false);

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
    const options = getPluginOptions({} as SentryNuxtModuleOptions, false);

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
    const options = getPluginOptions(customOptions, false);
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
});

describe('change sourcemap settings', () => {
  describe('changeViteSourcemapSettings', () => {
    let viteConfig: { build?: { sourcemap?: boolean | 'inline' | 'hidden' } };
    let sentryModuleOptions: SentryNuxtModuleOptions;

    beforeEach(() => {
      viteConfig = {};
      sentryModuleOptions = {};
    });

    it('should handle viteConfig.build.sourcemap settings', () => {
      const cases: {
        sourcemap?: boolean | 'hidden' | 'inline';
        expectedSourcemap: boolean | string;
        expectedReturn: UserSourceMapSetting;
      }[] = [
        { sourcemap: false, expectedSourcemap: false, expectedReturn: 'disabled' },
        { sourcemap: 'hidden', expectedSourcemap: 'hidden', expectedReturn: 'enabled' },
        { sourcemap: 'inline', expectedSourcemap: 'inline', expectedReturn: 'enabled' },
        { sourcemap: true, expectedSourcemap: true, expectedReturn: 'enabled' },
        { sourcemap: undefined, expectedSourcemap: 'hidden', expectedReturn: 'unset' },
      ];

      cases.forEach(({ sourcemap, expectedSourcemap, expectedReturn }) => {
        viteConfig.build = { sourcemap };
        const previousUserSourcemapSetting = getViteSourceMapSettingDefinition(viteConfig, sentryModuleOptions);
        expect(viteConfig.build.sourcemap).toBe(expectedSourcemap);
        expect(previousUserSourcemapSetting).toBe(expectedReturn);
      });
    });
  });

  describe('changeRollupSourcemapSettings', () => {
    let nitroConfig: {
      rollupConfig?: { output?: { sourcemap?: boolean | 'hidden' | 'inline'; sourcemapExcludeSources?: boolean } };
    };
    let sentryModuleOptions: SentryNuxtModuleOptions;

    beforeEach(() => {
      nitroConfig = {};
      sentryModuleOptions = {};
    });

    it('should handle nitroConfig.rollupConfig.output.sourcemap settings', () => {
      const cases: {
        output?: { sourcemap?: boolean | 'hidden' | 'inline' };
        expectedSourcemap: boolean | string;
        expectedReturn: UserSourceMapSetting;
      }[] = [
        { output: { sourcemap: false }, expectedSourcemap: false, expectedReturn: 'disabled' },
        { output: { sourcemap: 'hidden' }, expectedSourcemap: 'hidden', expectedReturn: 'enabled' },
        { output: { sourcemap: 'inline' }, expectedSourcemap: 'inline', expectedReturn: 'enabled' },
        { output: { sourcemap: true }, expectedSourcemap: true, expectedReturn: 'enabled' },
        { output: { sourcemap: undefined }, expectedSourcemap: 'hidden', expectedReturn: 'unset' },
        { output: undefined, expectedSourcemap: 'hidden', expectedReturn: 'unset' },
      ];

      cases.forEach(({ output, expectedSourcemap, expectedReturn }) => {
        nitroConfig.rollupConfig = { output };
        const previousUserSourceMapSetting = changeNitroSourceMapSettings(nitroConfig, sentryModuleOptions);
        expect(nitroConfig.rollupConfig?.output?.sourcemap).toBe(expectedSourcemap);
        expect(previousUserSourceMapSetting).toBe(expectedReturn);
        expect(nitroConfig.rollupConfig?.output?.sourcemapExcludeSources).toBe(false);
      });
    });

    describe('should handle nitroConfig.rollupConfig.output.sourcemap settings 2', () => {
      type MinimalNitroConfig = {
        sourceMap?: SourceMapSetting;
        rollupConfig?: {
          output?: { sourcemap?: SourceMapSetting; sourcemapExcludeSources?: boolean };
        };
      };
      type MinimalNuxtConfig = { options: { sourcemap?: SourceMapSetting | { server?: SourceMapSetting } } };

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

      const testCases: {
        name: string;
        nuxt: MinimalNuxtConfig;
        nitroConfig: MinimalNitroConfig;
        expectedNuxtSourcemap: boolean | string;
        expectedNitroSourcemap: boolean | string | undefined;
        expectedReturn: UserSourceMapSetting;
      }[] = [
        {
          name: 'Default case - Nuxt source map enabled, Nitro source map settings unset',
          nuxt: getNuxtConfig(true),
          nitroConfig: getNitroConfig(),
          expectedNuxtSourcemap: true,
          expectedNitroSourcemap: undefined, // in real-life Nitro, this value gets overwritten with the Nuxt setting
          expectedReturn: 'enabled',
        },
        {
          name: 'Nuxt source map disabled',
          nuxt: getNuxtConfig(false),
          nitroConfig: getNitroConfig(),
          expectedNuxtSourcemap: false,
          expectedNitroSourcemap: undefined, // in real-life Nitro, this value gets overwritten with the Nuxt setting
          expectedReturn: 'disabled',
        },
        {
          name: 'Nuxt source map disabled, Nitro source map enabled',
          nuxt: getNuxtConfig(false),
          nitroConfig: getNitroConfig(true),
          expectedNuxtSourcemap: false,
          expectedNitroSourcemap: true, // in real-life Nitro, this takes precedence over nuxt.sourcemap
          expectedReturn: 'enabled',
        },
        {
          name: 'Nuxt and Nitro sourcemap inline',
          nuxt: getNuxtConfig(true),
          nitroConfig: getNitroConfig('inline', 'inline'),
          expectedNuxtSourcemap: true,
          expectedNitroSourcemap: 'inline',
          expectedReturn: 'enabled',
        },
        {
          name: 'Both Nuxt and Nitro sourcemap explicitly true',
          nuxt: getNuxtConfig(true),
          nitroConfig: getNitroConfig(true, true),
          expectedNuxtSourcemap: true,
          expectedNitroSourcemap: true,
          expectedReturn: 'enabled',
        },
        {
          name: 'Nuxt sourcemap enabled, Nitro sourcemap undefined',
          nuxt: getNuxtConfig(true),
          nitroConfig: getNitroConfig(undefined, undefined),
          expectedNuxtSourcemap: true,
          expectedNitroSourcemap: undefined, // in real-life Nitro, this value gets overwritten with the Nuxt setting
          expectedReturn: 'enabled',
        },
        {
          name: 'Nuxt sourcemap enabled, Nitro config without output',
          nuxt: getNuxtConfig(true),
          nitroConfig: { sourceMap: undefined, rollupConfig: { output: undefined } },
          expectedNuxtSourcemap: true,
          expectedNitroSourcemap: undefined, // in real-life Nitro, this value gets overwritten with the Nuxt setting
          expectedReturn: 'enabled',
        },
        {
          name: 'Nuxt and Nitro source map undefined',
          nuxt: getNuxtConfig(),
          nitroConfig: getNitroConfig(),
          expectedNuxtSourcemap: 'hidden',
          expectedNitroSourcemap: undefined, // in real-life Nitro, this value gets overwritten with the Nuxt setting
          expectedReturn: 'unset',
        },
        {
          name: 'Edge case - Nuxt sourcemap as boolean',
          nuxt: { options: { sourcemap: true } },
          nitroConfig: getNitroConfig(),
          expectedNuxtSourcemap: true,
          expectedNitroSourcemap: undefined, // in real-life Nitro, this value gets overwritten with the Nuxt setting
          expectedReturn: 'enabled',
        },
        {
          name: 'Edge case - Nuxt sourcemap as string',
          nuxt: { options: { sourcemap: 'hidden' } },
          nitroConfig: getNitroConfig(),
          expectedNuxtSourcemap: 'hidden',
          expectedNitroSourcemap: undefined, // in real-life Nitro, this value gets overwritten with the Nuxt setting
          expectedReturn: 'enabled',
        },
      ];
      it.each(testCases)(
        '$name',
        ({ nuxt, nitroConfig, expectedNuxtSourcemap, expectedNitroSourcemap, expectedReturn }) => {
          const previousUserSourceMapSetting = changeNitroSourceMapSettings(nuxt, nitroConfig, sentryModuleOptions);

          const nuxtSourceMap = getNuxtSourceMapSetting(nuxt, 'server');

          expect(nuxtSourceMap).toBe(expectedNuxtSourcemap);
          expect(nitroConfig.sourceMap).toBe(expectedNitroSourcemap);

          expect(previousUserSourceMapSetting).toBe(expectedReturn);

          expect(nitroConfig.rollupConfig?.output?.sourcemapExcludeSources).toBe(false);
        },
      );
    });
  });

  describe('changeNuxtSourcemapSettings', () => {
    let nuxt: { options: { sourcemap: { client: boolean | 'hidden'; server: boolean | 'hidden' } } };
    let sentryModuleOptions: SentryNuxtModuleOptions;

    beforeEach(() => {
      // @ts-expect-error - Nuxt types don't accept `undefined` but we want to test this case
      nuxt = { options: { sourcemap: { client: undefined } } };
      sentryModuleOptions = {};
    });

    it('should handle nuxt.options.sourcemap.client settings', () => {
      const cases = [
        // { clientSourcemap: false, expectedSourcemap: false, expectedReturn: 'disabled' },
        // { clientSourcemap: 'hidden', expectedSourcemap: 'hidden', expectedReturn: 'enabled' },
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
});
