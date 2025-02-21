import type { Nuxt } from '@nuxt/schema';
import { consoleSandbox } from '@sentry/core';
import { type SentryRollupPluginOptions, sentryRollupPlugin } from '@sentry/rollup-plugin';
import { type SentryVitePluginOptions, sentryVitePlugin } from '@sentry/vite-plugin';
import type { NitroConfig } from 'nitropack';
import type { OutputOptions } from 'rollup';
import type { SentryNuxtModuleOptions } from '../common/types';

/**
 * Whether the user enabled (true, 'hidden', 'inline') or disabled (false) source maps
 */
export type UserSourceMapSetting = 'enabled' | 'disabled' | 'unset' | undefined;

/**
 *  Setup source maps for Sentry inside the Nuxt module during build time (in Vite for Nuxt and Rollup for Nitro).
 */
export function setupSourceMaps(moduleOptions: SentryNuxtModuleOptions, nuxt: Nuxt): void {
  const sourceMapsUploadOptions = moduleOptions.sourceMapsUploadOptions || {};
  const sourceMapsEnabled = sourceMapsUploadOptions.enabled ?? true;

  nuxt.hook('modules:done', () => {
    if (sourceMapsEnabled && !nuxt.options.dev) {
      changeNuxtSourceMapSettings(nuxt, moduleOptions);
    }
  });

  nuxt.hook('vite:extendConfig', async (viteConfig, _env) => {
    if (sourceMapsEnabled && viteConfig.mode !== 'development') {
      const previousUserSourceMapSetting = changeViteSourceMapSettings(viteConfig, moduleOptions);

      //  Add Sentry plugin
      viteConfig.plugins = viteConfig.plugins || [];
      viteConfig.plugins.push(
        sentryVitePlugin(getPluginOptions(moduleOptions, previousUserSourceMapSetting === 'unset')),
      );
    }
  });

  nuxt.hook('nitro:config', (nitroConfig: NitroConfig) => {
    if (sourceMapsEnabled && !nitroConfig.dev) {
      if (!nitroConfig.rollupConfig) {
        nitroConfig.rollupConfig = {};
      }

      if (nitroConfig.rollupConfig.plugins === null || nitroConfig.rollupConfig.plugins === undefined) {
        nitroConfig.rollupConfig.plugins = [];
      } else if (!Array.isArray(nitroConfig.rollupConfig.plugins)) {
        // `rollupConfig.plugins` can be a single plugin, so we want to put it into an array so that we can push our own plugin
        nitroConfig.rollupConfig.plugins = [nitroConfig.rollupConfig.plugins];
      }

      const previousUserSourceMapSetting = changeRollupSourceMapSettings(nitroConfig, moduleOptions);

      // Add Sentry plugin
      nitroConfig.rollupConfig.plugins.push(
        sentryRollupPlugin(getPluginOptions(moduleOptions, previousUserSourceMapSetting === 'unset')),
      );
    }
  });
}

/**
 * Normalizes the beginning of a path from e.g. ../../../ to ./
 */
function normalizePath(path: string): string {
  return path.replace(/^(\.\.\/)+/, './');
}

/**
 *  Generates source maps upload options for the Sentry Vite and Rollup plugin.
 *
 *  Only exported for Testing purposes.
 */
export function getPluginOptions(
  moduleOptions: SentryNuxtModuleOptions,
  deleteFilesAfterUpload: boolean,
): SentryVitePluginOptions | SentryRollupPluginOptions {
  const sourceMapsUploadOptions = moduleOptions.sourceMapsUploadOptions || {};

  if (typeof sourceMapsUploadOptions.sourcemaps?.filesToDeleteAfterUpload === 'undefined' && deleteFilesAfterUpload) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.log(
        '[Sentry] Setting `sentry.sourceMapsUploadOptions.sourcemaps.filesToDeleteAfterUpload: [".*/**/public/**/*.map"]` to delete generated source maps after they were uploaded to Sentry.',
      );
    });
  }

  return {
    org: sourceMapsUploadOptions.org ?? process.env.SENTRY_ORG,
    project: sourceMapsUploadOptions.project ?? process.env.SENTRY_PROJECT,
    authToken: sourceMapsUploadOptions.authToken ?? process.env.SENTRY_AUTH_TOKEN,
    telemetry: sourceMapsUploadOptions.telemetry ?? true,
    url: sourceMapsUploadOptions.url ?? process.env.SENTRY_URL,
    debug: moduleOptions.debug ?? false,
    silent: sourceMapsUploadOptions.silent ?? false,
    errorHandler: sourceMapsUploadOptions.errorHandler,
    release: {
      name: sourceMapsUploadOptions.release?.name,
      ...moduleOptions?.unstable_sentryBundlerPluginOptions?.release,
    },
    _metaOptions: {
      telemetry: {
        metaFramework: 'nuxt',
      },
    },
    ...moduleOptions?.unstable_sentryBundlerPluginOptions,

    sourcemaps: {
      // The server/client files are in different places depending on the nitro preset (e.g. '.output/server' or '.netlify/functions-internal/server')
      // We cannot determine automatically how the build folder looks like (depends on the preset), so we have to accept that source maps are uploaded multiple times (with the vitePlugin for Nuxt and the rollupPlugin for Nitro).
      // If we could know where the server/client assets are located, we could do something like this (based on the Nitro preset): isNitro ? ['./.output/server/**/*'] : ['./.output/public/**/*'],
      assets: sourceMapsUploadOptions.sourcemaps?.assets ?? undefined,
      ignore: sourceMapsUploadOptions.sourcemaps?.ignore ?? undefined,
      filesToDeleteAfterUpload: sourceMapsUploadOptions.sourcemaps?.filesToDeleteAfterUpload
        ? sourceMapsUploadOptions.sourcemaps?.filesToDeleteAfterUpload
        : deleteFilesAfterUpload
          ? ['.*/**/public/**/*.map']
          : undefined,
      rewriteSources: (source: string) => normalizePath(source),
      ...moduleOptions?.unstable_sentryBundlerPluginOptions?.sourcemaps,
    },
  };
}

/*  There are 3 ways to set up source maps (https://github.com/getsentry/sentry-javascript/issues/13993)
    1. User explicitly disabled source maps
      - keep this setting (emit a warning that errors won't be unminified in Sentry)
      - We will not upload anything
    2. users enabled source map generation (true, hidden, inline).
      - keep this setting (don't do anything - like deletion - besides uploading)
    3. users did not set source maps generation
      - we enable 'hidden' source maps generation
      - configure `filesToDeleteAfterUpload` to delete all .map files (we emit a log about this)

    Nuxt has 3 places to set source maps: vite options, rollup options, nuxt itself
    Ideally, all 3 are enabled to get all source maps.
 */

/** only exported for testing */
export function changeNuxtSourceMapSettings(
  nuxt: Nuxt,
  sentryModuleOptions: SentryNuxtModuleOptions,
): { client: UserSourceMapSetting; server: UserSourceMapSetting } {
  nuxt.options = nuxt.options || {};
  nuxt.options.sourcemap = nuxt.options.sourcemap ?? { server: undefined, client: undefined };

  let previousUserSourceMapSetting: { client: UserSourceMapSetting; server: UserSourceMapSetting } = {
    client: undefined,
    server: undefined,
  };

  const nuxtSourceMap = nuxt.options.sourcemap;

  if (typeof nuxtSourceMap === 'string' || typeof nuxtSourceMap === 'boolean' || typeof nuxtSourceMap === 'undefined') {
    switch (nuxtSourceMap) {
      case false:
        warnExplicitlyDisabledSourceMap('sourcemap');
        previousUserSourceMapSetting = { client: 'disabled', server: 'disabled' };
        break;

      case 'hidden':
      case true:
        logKeepSourceMapSetting(sentryModuleOptions, 'sourcemap', (nuxtSourceMap as true).toString());
        previousUserSourceMapSetting = { client: 'enabled', server: 'enabled' };
        break;
      case undefined:
        nuxt.options.sourcemap = { server: 'hidden', client: 'hidden' };
        logSentryEnablesSourceMap('sourcemap.client', 'hidden');
        logSentryEnablesSourceMap('sourcemap.server', 'hidden');
        previousUserSourceMapSetting = { client: 'unset', server: 'unset' };
        break;
    }
  } else {
    if (nuxtSourceMap.client === false) {
      warnExplicitlyDisabledSourceMap('sourcemap.client');
      previousUserSourceMapSetting.client = 'disabled';
    } else if (['hidden', true].includes(nuxtSourceMap.client)) {
      logKeepSourceMapSetting(sentryModuleOptions, 'sourcemap.client', nuxtSourceMap.client.toString());
      previousUserSourceMapSetting.client = 'enabled';
    } else {
      nuxt.options.sourcemap.client = 'hidden';
      logSentryEnablesSourceMap('sourcemap.client', 'hidden');
      previousUserSourceMapSetting.client = 'unset';
    }

    if (nuxtSourceMap.server === false) {
      warnExplicitlyDisabledSourceMap('sourcemap.server');
      previousUserSourceMapSetting.server = 'disabled';
    } else if (['hidden', true].includes(nuxtSourceMap.server)) {
      logKeepSourceMapSetting(sentryModuleOptions, 'sourcemap.server', nuxtSourceMap.server.toString());
      previousUserSourceMapSetting.server = 'enabled';
    } else {
      nuxt.options.sourcemap.server = 'hidden';
      logSentryEnablesSourceMap('sourcemap.server', 'hidden');
      previousUserSourceMapSetting.server = 'unset';
    }
  }

  return previousUserSourceMapSetting;
}

/** only exported for testing */
export function changeViteSourceMapSettings(
  viteConfig: { build?: { sourcemap?: boolean | 'inline' | 'hidden' } },
  sentryModuleOptions: SentryNuxtModuleOptions,
): UserSourceMapSetting {
  viteConfig.build = viteConfig.build || {};
  const viteSourceMap = viteConfig.build.sourcemap;

  let previousUserSourceMapSetting: UserSourceMapSetting;

  if (viteSourceMap === false) {
    warnExplicitlyDisabledSourceMap('vite.build.sourcemap');
    previousUserSourceMapSetting = 'disabled';
  } else if (viteSourceMap && ['hidden', 'inline', true].includes(viteSourceMap)) {
    logKeepSourceMapSetting(sentryModuleOptions, 'vite.build.sourcemap', viteSourceMap.toString());
    previousUserSourceMapSetting = 'enabled';
  } else {
    viteConfig.build.sourcemap = 'hidden';
    logSentryEnablesSourceMap('vite.build.sourcemap', 'hidden');
    previousUserSourceMapSetting = 'unset';
  }

  return previousUserSourceMapSetting;
}

/** only exported for testing */
export function changeRollupSourceMapSettings(
  nitroConfig: {
    rollupConfig?: {
      output?: {
        sourcemap?: OutputOptions['sourcemap'];
        sourcemapExcludeSources?: OutputOptions['sourcemapExcludeSources'];
      };
    };
  },
  sentryModuleOptions: SentryNuxtModuleOptions,
): UserSourceMapSetting {
  nitroConfig.rollupConfig = nitroConfig.rollupConfig || {};
  nitroConfig.rollupConfig.output = nitroConfig.rollupConfig.output || { sourcemap: undefined };

  let previousUserSourceMapSetting: UserSourceMapSetting;

  const nitroSourceMap = nitroConfig.rollupConfig.output.sourcemap;

  if (nitroSourceMap === false) {
    warnExplicitlyDisabledSourceMap('nitro.rollupConfig.output.sourcemap');
    previousUserSourceMapSetting = 'disabled';
  } else if (nitroSourceMap && ['hidden', 'inline', true].includes(nitroSourceMap)) {
    logKeepSourceMapSetting(sentryModuleOptions, 'nitro.rollupConfig.output.sourcemap', nitroSourceMap.toString());
    previousUserSourceMapSetting = 'enabled';
  } else {
    nitroConfig.rollupConfig.output.sourcemap = 'hidden';
    logSentryEnablesSourceMap('nitro.rollupConfig.output.sourcemap', 'hidden');
    previousUserSourceMapSetting = 'unset';
  }

  nitroConfig.rollupConfig.output.sourcemapExcludeSources = false;
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.log(
      '[Sentry] Disabled source map setting in the Nuxt config: `nitro.rollupConfig.output.sourcemapExcludeSources`. Source maps will include the actual code to be able to un-minify code snippets in Sentry.',
    );
  });

  return previousUserSourceMapSetting;
}

function logKeepSourceMapSetting(
  sentryNuxtModuleOptions: SentryNuxtModuleOptions,
  settingKey: string,
  settingValue: string,
): void {
  if (sentryNuxtModuleOptions.debug) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.log(
        `[Sentry] We discovered \`${settingKey}\` is set to \`${settingValue}\`. Sentry will keep this source map setting. This will un-minify the code snippet on the Sentry Issue page.`,
      );
    });
  }
}

function warnExplicitlyDisabledSourceMap(settingKey: string): void {
  consoleSandbox(() => {
    //  eslint-disable-next-line no-console
    console.warn(
      `[Sentry] Parts of source map generation are currently disabled in your Nuxt configuration (\`${settingKey}: false\`). This setting is either a default setting or was explicitly set in your configuration. Sentry won't override this setting. Without source maps, code snippets on the Sentry Issues page will remain minified. To show unminified code, enable source maps in \`${settingKey}\` (e.g. by setting them to \`hidden\`).`,
    );
  });
}

function logSentryEnablesSourceMap(settingKey: string, settingValue: string): void {
  consoleSandbox(() => {
    //  eslint-disable-next-line no-console
    console.log(`[Sentry] Enabled source map generation in the build options with \`${settingKey}: ${settingValue}\`.`);
  });
}
