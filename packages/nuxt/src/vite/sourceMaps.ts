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
      const sentryPlugins = sentryVitePlugin({
        org: sourceMapsUploadOptions.org ?? process.env.SENTRY_ORG,
        project: sourceMapsUploadOptions.project ?? process.env.SENTRY_PROJECT,
        authToken: sourceMapsUploadOptions.authToken ?? process.env.SENTRY_AUTH_TOKEN,
        telemetry: sourceMapsUploadOptions.telemetry ?? true,
        _metaOptions: {
          telemetry: {
            metaFramework: 'nuxt',
          },
        },
        debug: moduleOptions.debug ?? false,
      });

      viteInlineConfig.plugins = viteInlineConfig.plugins || [];
      viteInlineConfig.plugins.push(...sentryPlugins);

      viteInlineConfig.build = viteInlineConfig.build || {};
      viteInlineConfig.build.sourcemap = true;
    }
  });
}
