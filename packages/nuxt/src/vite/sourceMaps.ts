import type { Nuxt, NuxtOptions } from '@nuxt/schema';
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
  const isDebug = moduleOptions.debug;

  const sourceMapsUploadOptions = moduleOptions.sourceMapsUploadOptions || {};
  const sourceMapsEnabled = sourceMapsUploadOptions.enabled ?? true;

  // In case we overwrite the source map settings, we default to deleting the files
  let deleteFilesAfterUploadFallback = { client: true, server: true };

  nuxt.hook('modules:done', () => {
    if (sourceMapsEnabled && !nuxt.options.dev) {
      // Changing this setting will propagate:
      // - for client to viteConfig.build.sourceMap
      // - for server to viteConfig.build.sourceMap and nitro.sourceMap
      // On server, nitro.rollupConfig.output.sourcemap remains unaffected from this change.

      // ONLY THIS nuxt.sourcemap.(server/client) setting is the one Sentry will eventually overwrite with 'hidden'
      const previousSourceMapSettings = changeNuxtSourceMapSettings(nuxt, moduleOptions);

      deleteFilesAfterUploadFallback = {
        client: previousSourceMapSettings.client === 'unset',
        server: previousSourceMapSettings.server === 'unset',
      };

      if (
        isDebug &&
        !sourceMapsUploadOptions.sourcemaps?.filesToDeleteAfterUpload &&
        (deleteFilesAfterUploadFallback.client || deleteFilesAfterUploadFallback.server)
      ) {
        consoleSandbox(() =>
          // eslint-disable-next-line no-console
          console.log(
            `[Sentry] As Sentry enabled \`'hidden'\` source maps, source maps are deleted after upload (setting \`deleteFilesAfterUpload: [${[
              ...(deleteFilesAfterUploadFallback.client ? defaultClientFilesToDeletePaths : []),
              ...(deleteFilesAfterUploadFallback.server ? defaultServerFilesToDeletePaths : []),
            ]
              // Logging it as strings in the array
              .map(path => `"${path}"`)
              .join(', ')}]\`).`,
          ),
        );
      }

      console.log('shoulddelte', deleteFilesAfterUploadFallback);
      // not doing anything
      console.log('nuxt:sms:', previousSourceMapSettings, nuxt.options.sourcemap);
    }
  });

  // modify source maps settings (nuxt)
  // use source map settings in plugins

  nuxt.hook('vite:extendConfig', async (viteConfig, env) => {
    // vite config resembles nuxt config
    if (sourceMapsEnabled && viteConfig.mode !== 'development') {
      console.log('vite:sms:config', viteConfig?.build?.sourcemap);
      console.log('nuxt sourcemap (vite)', nuxt.options.sourcemap);

      console.log('shoulddelte', deleteFilesAfterUploadFallback);

      const runtime = env.isServer ? 'server' : env.isClient ? 'client' : undefined;
      const nuxtSourceMapSetting = getNuxtSourceMapSetting(nuxt, runtime);

      // todo: sourcemaps vite are same as sourcemaps nuxt

      if (runtime === 'client' && nuxtSourceMapSetting === false) {
        if (isDebug) {
          consoleSandbox(() =>
            // eslint-disable-next-line no-console
            console.log(
              `[Sentry] Adding Sentry Vite plugin to ${runtime} runtime. The Vite plugin will delete source maps after upload (setting \`deleteFilesAfterUpload: "${defaultClientFilesToDeletePaths}"\`).`,
            ),
          );
        }

        //  Add Sentry plugin with option to delete source maps after upload (they are not generated anyway)
        viteConfig.plugins = viteConfig.plugins || [];
        viteConfig.plugins.push(
          sentryVitePlugin(getPluginOptions(moduleOptions, true, deleteFilesAfterUploadFallback)),
        );

        // Nuxt client source map is false by default.
        // Warning about this will be shown already in an earlier step, and it's also documented that nuxt.sourcemap.client needs to be enabled
        return;
      }

      consoleSandbox(() =>
        // eslint-disable-next-line no-console
        console.log(
          // todo: modify log (not "using this setting", but "uploading source maps")
          `[Sentry] Adding Sentry Vite plugin to ${runtime} runtime. /* todo what does deleteFilesAfterUpload do */`,
        ),
      );

      const previousUserSourceMapSetting = getViteSourceMapSettingDefinition(
        viteConfig,
        moduleOptions,
        runtime,
        nuxtSourceMapSetting,
      );
      //  console.log('vite:sms:', previousUserSourceMapSetting, viteConfig?.build?.sourcemap);

      //  todo: show difference between ss settings
      const viteSourceMapSetting = viteConfig?.build?.sourcemap;

      if (isDebug) {
        if (!runtime) {
          //  eslint-disable-next-line no-console
          console.log(
            `[Sentry] Cannot detect runtime (client/server) inside hook 'vite:extendConfig'. Sentry will default to deleting source maps files after uploading them to Sentry. Setting \`filesToDeleteAfterUpload: ${defaultClientFilesToDeletePaths}\`.`,
          );
        } else {
          consoleSandbox(() => {
            //  eslint-disable-next-line no-console
            console.log(
              `[Sentry] ${
                env.isServer
                  ? getNuxtSourceMapSetting(nuxt, 'server')
                  : env.isClient
                    ? getNuxtSourceMapSetting(nuxt, 'client')
                    : ''
              }`,
            );
          });
        }
      }

      //  todo: if people disabled sourcemap in vite config - we don't do anything about it

      //  Add Sentry plugin
      //  Vite plugin is added on the client and server side (hook runs twice)
      viteConfig.plugins = viteConfig.plugins || [];
      viteConfig.plugins.push(
        sentryVitePlugin(getPluginOptions(moduleOptions, false /*  previousUserSourceMapSetting === 'unset'  */)),
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
        //  `rollupConfig.plugins` can be a single plugin, so we want to put it into an array so that we can push our own plugin
        nitroConfig.rollupConfig.plugins = [nitroConfig.rollupConfig.plugins];
      }
      console.log('rollup:sms:config', nitroConfig?.rollupConfig?.output?.sourcemap);

      //  todo: use other values as well to determine this
      const previousUserSourceMapSetting = changeNitroSourceMapSettings(nuxt, nitroConfig, moduleOptions);

      console.log('rollup:sms:', previousUserSourceMapSetting, nitroConfig?.rollupConfig?.output?.sourcemap);

      //  Add Sentry plugin
      //  Runs only on server-side (Nitro)
      nitroConfig.rollupConfig.plugins.push(
        sentryRollupPlugin(
          getPluginOptions(moduleOptions, previousUserSourceMapSetting === 'unset', deleteFilesAfterUploadFallback),
        ),
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

//  todo: use this path
const defaultClientFilesToDeletePaths = ['.*/**/public/**/*.map'];
const defaultServerFilesToDeletePaths = ['.*/**/server/**/*.map', '.*/**/output/**/*.map', '.*/**/function/**/*.map'];
/**
 *  Generates source maps upload options for the Sentry Vite and Rollup plugin.
 *
 *  Only exported for Testing purposes.
 */
/**
 *
 */
export function getPluginOptions(
  moduleOptions: SentryNuxtModuleOptions,
  deleteFilesAfterUpload: boolean, // todo: delete this argument
  deleteFilesAfterUploadFallback?: { client: boolean; server: boolean },
): SentryVitePluginOptions | SentryRollupPluginOptions {
  const sourceMapsUploadOptions = moduleOptions.sourceMapsUploadOptions || {};

  // todo: rename - or extra function??
  const defaultfiles = [
    ...(deleteFilesAfterUploadFallback?.client ? defaultClientFilesToDeletePaths : []),
    ...(deleteFilesAfterUploadFallback?.server ? defaultServerFilesToDeletePaths : []),
  ];

  const shouldDeleteFilesAfterUpload = deleteFilesAfterUploadFallback?.client || deleteFilesAfterUploadFallback?.server;

  if (
    typeof sourceMapsUploadOptions.sourcemaps?.filesToDeleteAfterUpload === 'undefined' &&
    shouldDeleteFilesAfterUpload
  ) {
    // todo: file path
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.log(
        `[Sentry] Setting \`sentry.sourceMapsUploadOptions.sourcemaps.filesToDeleteAfterUpload: [${defaultfiles.toString()}]\` to delete generated source maps after they were uploaded to Sentry.`,
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
      //  The server/client files are in different places depending on the nitro preset (e.g. '.output/server' or '.netlify/functions-internal/server')
      //  We cannot determine automatically how the build folder looks like (depends on the preset), so we have to accept that source maps are uploaded multiple times (with the vitePlugin for Nuxt and the rollupPlugin for Nitro).
      //  If we could know where the server/client assets are located, we could do something like this (based on the Nitro preset): isNitro ? ['./.output/server/**/*'] : ['./.output/public/**/*'],
      assets: sourceMapsUploadOptions.sourcemaps?.assets ?? undefined,
      ignore: sourceMapsUploadOptions.sourcemaps?.ignore ?? undefined,
      filesToDeleteAfterUpload: sourceMapsUploadOptions.sourcemaps?.filesToDeleteAfterUpload
        ? sourceMapsUploadOptions.sourcemaps?.filesToDeleteAfterUpload
        : deleteFilesAfterUploadFallback?.server || deleteFilesAfterUploadFallback?.client
          ? defaultfiles
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
/**
 *
 */
export function getNuxtSourceMapSetting(
  nuxt: Nuxt,
  runtime: 'client' | 'server' | undefined,
): SourceMapSetting | undefined {
  if (!runtime) {
    return undefined;
  } else {
    return typeof nuxt.options?.sourcemap === 'boolean' || typeof nuxt.options?.sourcemap === 'string'
      ? nuxt.options.sourcemap
      : nuxt.options?.sourcemap?.[runtime];
  }
}

/** only exported for testing  */
export function changeNuxtSourceMapSettings(
  nuxt: Nuxt,
  sentryModuleOptions: SentryNuxtModuleOptions,
): { client: UserSourceMapSetting; server: UserSourceMapSetting } {
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
        logKeepEnabledSourceMapSetting(sentryModuleOptions, 'sourcemap', (nuxtSourceMap as true).toString());
        previousUserSourceMapSetting = { client: 'enabled', server: 'enabled' };
        break;
      case undefined:
        nuxt.options.sourcemap = { server: 'hidden', client: 'hidden' }; //  todo: here, it's overwritten
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
      logKeepEnabledSourceMapSetting(sentryModuleOptions, 'sourcemap.client', nuxtSourceMap.client.toString());
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
      logKeepEnabledSourceMapSetting(sentryModuleOptions, 'sourcemap.server', nuxtSourceMap.server.toString());
      previousUserSourceMapSetting.server = 'enabled';
    } else {
      nuxt.options.sourcemap.server = 'hidden'; //  todo here it's overwritten
      logSentryEnablesSourceMap('sourcemap.server', 'hidden');
      previousUserSourceMapSetting.server = 'unset';
    }
  }

  return previousUserSourceMapSetting;
}

/** only exported for testing  */
export function getViteSourceMapSettingDefinition(
  viteConfig: { build?: { sourcemap?: boolean | 'inline' | 'hidden' } },
  sentryModuleOptions: SentryNuxtModuleOptions,
  nuxtRuntime?: 'client' | 'server',
  nuxtSourceMapSettingForRuntime?: SourceMapSetting,
): UserSourceMapSetting {
  viteConfig.build = viteConfig.build || {};
  const viteSourceMap = viteConfig.build.sourcemap;
  //  todo: we check the value but do nothing with it

  let previousUserSourceMapSetting: UserSourceMapSetting;

  //  todo: this is false in vite client (as nuxt client is false as well)

  console.log('[Sentry] vite source map', nuxtRuntime, viteConfig.build.sourcemap);
  console.log('[Sentry] nuxt sourcema', nuxtSourceMapSettingForRuntime);

  if (nuxtSourceMapSettingForRuntime !== viteSourceMap) {
    warnDifferentSourceMapSettings({
      nuxtSettingKey: `sourcemap.${nuxtRuntime}`,
      nuxtSettingValue: nuxtSourceMapSettingForRuntime,
      otherSettingKey: 'viteConfig.build.sourcemap',
      otherSettingValue: viteConfig.build.sourcemap,
    });
  }

  if (viteSourceMap === false) {
    warnExplicitlyDisabledSourceMap('vite.build.sourcemap');
    previousUserSourceMapSetting = 'disabled';
  } else if (viteSourceMap && ['hidden', 'inline', true].includes(viteSourceMap)) {
    logKeepEnabledSourceMapSetting(sentryModuleOptions, 'vite.build.sourcemap', viteSourceMap.toString());
    previousUserSourceMapSetting = 'enabled';
  } else {
    //  todo: do not change this
    //  viteConfig.build.sourcemap = 'hidden';
    logSentryEnablesSourceMap('vite.build.sourcemap', 'hidden');
    previousUserSourceMapSetting = 'unset';
  }

  return previousUserSourceMapSetting;
}

//  check if any server value is false or true

export type SourceMapSetting = boolean | 'hidden' | 'inline';

/** only exported for testing  */
export function changeNitroSourceMapSettings(
  nuxt: { options: { sourcemap?: SourceMapSetting | { server?: SourceMapSetting } } },
  nitroConfig: NitroConfig,
  sentryModuleOptions: SentryNuxtModuleOptions,
): void {
  const isDebug = sentryModuleOptions.debug;

  const nitroSourceMap = nitroConfig.sourceMap;
  const nuxtSourceMap =
    typeof nuxt.options?.sourcemap === 'boolean' || typeof nuxt.options?.sourcemap === 'string'
      ? nuxt.options.sourcemap
      : nuxt.options?.sourcemap?.server;

  if (nuxtSourceMap !== nitroSourceMap) {
    warnDifferentSourceMapSettings({
      nuxtSettingKey: 'sourcemap.server',
      nuxtSettingValue: nuxtSourceMap,
      otherSettingKey: 'nitro.sourceMap',
      otherSettingValue: nitroConfig.sourceMap,
    });
  }

  nitroConfig.rollupConfig = nitroConfig.rollupConfig || {};
  nitroConfig.rollupConfig.output = nitroConfig.rollupConfig.output || { sourcemap: undefined };
  const nitroRollupSourceMap = nitroConfig.rollupConfig.output.sourcemap;

  //  We don't override nitro.rollupConfig.output.sourcemap (undefined by default, but overrides all other server-side source map settings)
  //  Just logging out info that changing this setting could lead to problems
  if (
    typeof nitroRollupSourceMap !== 'undefined' &&
    (nitroRollupSourceMap === false || ['hidden', 'inline', true].includes(nitroRollupSourceMap))
  ) {
    const settingKey = 'nitro.rollupConfig.output.sourcemap';

    if (isDebug) {
      warnDifferentSourceMapSettings({
        nuxtSettingKey: 'sourcemap.server',
        nuxtSettingValue: nuxtSourceMap,
        otherSettingKey: settingKey,
        otherSettingValue: nitroRollupSourceMap,
      });
    }
  }

  nitroConfig.rollupConfig.output.sourcemapExcludeSources = false;
  if (isDebug) {
    consoleSandbox(() => {
      //  eslint-disable-next-line no-console
      console.log(
        '[Sentry] Set `sourcemapExcludeSources: false` in the Nuxt config (`nitro.rollupConfig.output`). Source maps will now include the actual code to be able to un-minify code snippets in Sentry.',
      );
    });
  }
}

function logKeepEnabledSourceMapSetting(
  sentryNuxtModuleOptions: SentryNuxtModuleOptions,
  settingKey: string,
  settingValue: string,
): void {
  if (sentryNuxtModuleOptions.debug) {
    consoleSandbox(() => {
      //  eslint-disable-next-line no-console
      console.log(
        `[Sentry] We discovered \`${settingKey}\` is set to \`${settingValue}\`. This will un-minify the code snippet on the Sentry Issue page. Be aware that there might be other source map settings in your config which could overwrite this setting.`,
      );
    });
  }
}

function warnExplicitlyDisabledSourceMap(settingKey: string): void {
  consoleSandbox(() => {
    //  eslint-disable-next-line no-console
    console.warn(
      `[Sentry] We discovered \`${settingKey}\` is set to \`false\`. This setting is either a default setting or was explicitly set in your configuration. Sentry won't override this setting. Without source maps, code snippets on the Sentry Issues page will remain minified. To show unminified code, enable source maps in \`${settingKey}\` (e.g. by setting them to \`'hidden'\`).`,
    );
  });
}

function warnDifferentSourceMapSettings({
  nuxtSettingKey,
  nuxtSettingValue,
  otherSettingKey,
  otherSettingValue,
}: {
  nuxtSettingKey: string;
  nuxtSettingValue?: SourceMapSetting;
  otherSettingKey: string;
  otherSettingValue?: SourceMapSetting;
}): void {
  consoleSandbox(() => {
    //  eslint-disable-next-line no-console
    console.warn(
      `[Sentry] Source map generation settings are conflicting. Sentry uses \`${nuxtSettingKey}: ${nuxtSettingValue}\`. However, a conflicting setting was discovered (\`${otherSettingKey}: ${otherSettingValue}\`). This setting was probably explicitly set in your configuration. Sentry won't override this setting but it may affect source maps generation and upload. Without source maps, code snippets on the Sentry Issues page will remain minified.`,
    );
  });
}

function logSentryEnablesSourceMap(settingKey: string, settingValue: string): void {
  consoleSandbox(() => {
    //  eslint-disable-next-line no-console
    console.log(`[Sentry] Enabled source map generation in the build options with \`${settingKey}: ${settingValue}\`.`);
  });
}
