import type { Nuxt } from '@nuxt/schema';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import type { SentryNuxtModuleOptions } from '../common/types';

/**
 *  Setup source maps for Sentry inside the Nuxt module during build time.
 */
export function setupSourceMaps(moduleOptions: SentryNuxtModuleOptions, nuxt: Nuxt): void {
  nuxt.hook('vite:extendConfig', async (viteInlineConfig, _env) => {
    const sourceMapsUploadOptions = moduleOptions.sourceMapsUploadOptions || {};

    if ((sourceMapsUploadOptions.enabled ?? true) && viteInlineConfig.mode !== 'development') {
      const sentryPlugin = sentryVitePlugin({
        org: sourceMapsUploadOptions.org ?? process.env.SENTRY_ORG,
        project: sourceMapsUploadOptions.project ?? process.env.SENTRY_PROJECT,
        authToken: sourceMapsUploadOptions.authToken ?? process.env.SENTRY_AUTH_TOKEN,
        telemetry: sourceMapsUploadOptions.telemetry ?? true,
        sourcemaps: {
          assets: sourceMapsUploadOptions.sourcemaps?.assets ?? undefined,
          ignore: sourceMapsUploadOptions.sourcemaps?.ignore ?? undefined,
          filesToDeleteAfterUpload: sourceMapsUploadOptions.sourcemaps?.filesToDeleteAfterUpload ?? undefined,
        },
        _metaOptions: {
          telemetry: {
            metaFramework: 'nuxt',
          },
        },
        debug: moduleOptions.debug ?? false,
      });

      viteInlineConfig.plugins = viteInlineConfig.plugins || [];
      viteInlineConfig.plugins.push(sentryPlugin);

      const sourceMapsPreviouslyEnabled = viteInlineConfig.build?.sourcemap;

      if (moduleOptions.debug && !sourceMapsPreviouslyEnabled) {
        // eslint-disable-next-line no-console
        console.log('[Sentry]: Enabled source maps generation in the Vite build options.');
        if (!moduleOptions.sourceMapsUploadOptions?.sourcemaps?.filesToDeleteAfterUpload) {
          // eslint-disable-next-line no-console
          console.warn(
            `[Sentry] We recommend setting the \`sourceMapsUploadOptions.sourcemaps.filesToDeleteAfterUpload\` option to clean up source maps after uploading.
[Sentry] Otherwise, source maps might be deployed to production, depending on your configuration`,
          );
        }
      }

      viteInlineConfig.build = viteInlineConfig.build || {};
      viteInlineConfig.build.sourcemap = true;
    }
  });
}
