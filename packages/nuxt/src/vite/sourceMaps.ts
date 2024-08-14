import type { Nuxt } from '@nuxt/schema';
import { sentryRollupPlugin } from '@sentry/rollup-plugin';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import type { NitroConfig } from 'nitropack';
import type { SentryNuxtModuleOptions } from '../common/types';

/**
 *  Setup source maps for Sentry inside the Nuxt module during build time.
 */
export function setupSourceMaps(moduleOptions: SentryNuxtModuleOptions, nuxt: Nuxt): void {
  const sourceMapsUploadOptions = moduleOptions.sourceMapsUploadOptions || {};
  const sourceMapsEnabled = sourceMapsUploadOptions.enabled ?? true;

  nuxt.hook('vite:extendConfig', async (viteInlineConfig, _env) => {
    if (sourceMapsEnabled && viteInlineConfig.mode !== 'development') {
      const sentryPlugin = sentryVitePlugin(getPluginOptions(moduleOptions));

      // Add Sentry plugin
      viteInlineConfig.plugins = viteInlineConfig.plugins || [];
      viteInlineConfig.plugins.push(sentryPlugin);

      // Enable source maps
      viteInlineConfig.build = viteInlineConfig.build || {};
      viteInlineConfig.build.sourcemap = true;

      logDebugInfo(moduleOptions, viteInlineConfig.build?.sourcemap);
    }
  });

  nuxt.hook('nitro:config', (nitroConfig: NitroConfig) => {
    if (sourceMapsEnabled && !nitroConfig.dev) {
      const sentryPlugin = sentryRollupPlugin(getPluginOptions(moduleOptions));

      if (nitroConfig.rollupConfig) {
        // Add Sentry plugin
        if (!Array.isArray(nitroConfig.rollupConfig.plugins)) {
          nitroConfig.rollupConfig.plugins = nitroConfig.rollupConfig.plugins ? [nitroConfig.rollupConfig.plugins] : [];
        }
        nitroConfig.rollupConfig.plugins.push(sentryPlugin);

        // Enable source maps
        nitroConfig.rollupConfig.output = nitroConfig?.rollupConfig?.output || {};
        nitroConfig.rollupConfig.output.sourcemap = true;
        nitroConfig.rollupConfig.output.sourcemapExcludeSources = false; // Adding "sourcesContent" to the source map (Nitro sets this eto `true`)

        logDebugInfo(moduleOptions, nitroConfig.rollupConfig.output?.sourcemap);
      }
    }
  });
}

/**
 * Normalizes the beginning of a path from e.g. ../../../ to ./
 */
function normalizePath(path: string): string {
  return path.replace(/^(\.\.\/)+/, './');
}

function getPluginOptions(moduleOptions: SentryNuxtModuleOptions): object {
  const sourceMapsUploadOptions = moduleOptions.sourceMapsUploadOptions || {};

  return {
    org: sourceMapsUploadOptions.org ?? process.env.SENTRY_ORG,
    project: sourceMapsUploadOptions.project ?? process.env.SENTRY_PROJECT,
    authToken: sourceMapsUploadOptions.authToken ?? process.env.SENTRY_AUTH_TOKEN,
    telemetry: sourceMapsUploadOptions.telemetry ?? true,
    sourcemaps: {
      assets: sourceMapsUploadOptions.sourcemaps?.assets ?? ['./.output/public/**/*', './.output/server/**/*'],
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
        `[Sentry] We recommend setting the \`sourceMapsUploadOptions.sourcemaps.filesToDeleteAfterUpload\` option to clean up source maps after uploading.
[Sentry] Otherwise, source maps might be deployed to production, depending on your configuration`,
      );
    }
  }
}
