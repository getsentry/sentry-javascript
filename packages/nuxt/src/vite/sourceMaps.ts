import type { Nuxt } from '@nuxt/schema';
import { type SentryRollupPluginOptions, sentryRollupPlugin } from '@sentry/rollup-plugin';
import { type SentryVitePluginOptions, sentryVitePlugin } from '@sentry/vite-plugin';
import type { NitroConfig } from 'nitropack';
import type { SentryNuxtModuleOptions } from '../common/types';

/**
 *  Setup source maps for Sentry inside the Nuxt module during build time (in Vite for Nuxt and Rollup for Nitro).
 */
export function setupSourceMaps(moduleOptions: SentryNuxtModuleOptions, nuxt: Nuxt): void {
  const sourceMapsUploadOptions = moduleOptions.sourceMapsUploadOptions || {};
  const sourceMapsEnabled = sourceMapsUploadOptions.enabled ?? true;

  nuxt.hook('vite:extendConfig', async (viteInlineConfig, _env) => {
    if (sourceMapsEnabled && viteInlineConfig.mode !== 'development') {
      // Add Sentry plugin
      viteInlineConfig.plugins = viteInlineConfig.plugins || [];
      viteInlineConfig.plugins.push(sentryVitePlugin(getPluginOptions(moduleOptions)));

      // Enable source maps
      viteInlineConfig.build = viteInlineConfig.build || {};
      viteInlineConfig.build.sourcemap = true;

      logDebugInfo(moduleOptions, viteInlineConfig.build?.sourcemap);
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

      // Add Sentry plugin
      nitroConfig.rollupConfig.plugins.push(sentryRollupPlugin(getPluginOptions(moduleOptions, true)));

      // Enable source maps
      nitroConfig.rollupConfig.output = nitroConfig?.rollupConfig?.output || {};
      nitroConfig.rollupConfig.output.sourcemap = true;
      nitroConfig.rollupConfig.output.sourcemapExcludeSources = false; // Adding "sourcesContent" to the source map (Nitro sets this eto `true`)

      logDebugInfo(moduleOptions, nitroConfig.rollupConfig.output?.sourcemap);
    }
  });
}

/**
 * Normalizes the beginning of a path from e.g. ../../../ to ./
 */
function normalizePath(path: string): string {
  return path.replace(/^(\.\.\/)+/, './');
}

function getPluginOptions(
  moduleOptions: SentryNuxtModuleOptions,
  isNitro = false,
): SentryVitePluginOptions | SentryRollupPluginOptions {
  const sourceMapsUploadOptions = moduleOptions.sourceMapsUploadOptions || {};

  return {
    org: sourceMapsUploadOptions.org ?? process.env.SENTRY_ORG,
    project: sourceMapsUploadOptions.project ?? process.env.SENTRY_PROJECT,
    authToken: sourceMapsUploadOptions.authToken ?? process.env.SENTRY_AUTH_TOKEN,
    telemetry: sourceMapsUploadOptions.telemetry ?? true,
    sourcemaps: {
      assets:
        sourceMapsUploadOptions.sourcemaps?.assets ?? isNitro ? ['./.output/server/**/*'] : ['./.output/public/**/*'],
      ignore: sourceMapsUploadOptions.sourcemaps?.ignore ?? undefined,
      filesToDeleteAfterUpload: sourceMapsUploadOptions.sourcemaps?.filesToDeleteAfterUpload ?? undefined,
      rewriteSources: (source: string) => normalizePath(source),
    },
    _metaOptions: {
      telemetry: {
        metaFramework: 'nuxt',
      },
    },
    debug: moduleOptions.debug ?? false,
  };
}

function logDebugInfo(moduleOptions: SentryNuxtModuleOptions, sourceMapsPreviouslyEnabled: boolean): void {
  if (moduleOptions.debug && !sourceMapsPreviouslyEnabled) {
    // eslint-disable-next-line no-console
    console.log('[Sentry]: Enabled source maps generation in the Vite build options.');

    const sourceMapsUploadOptions = moduleOptions.sourceMapsUploadOptions || {};

    if (!sourceMapsUploadOptions.sourcemaps?.filesToDeleteAfterUpload) {
      // eslint-disable-next-line no-console
      console.warn(
        '[Sentry] We recommend setting the `sourceMapsUploadOptions.sourcemaps.filesToDeleteAfterUpload` option to clean up source maps after uploading. Otherwise, source maps might be deployed to production, depending on your configuration',
      );
    }
  }
}
