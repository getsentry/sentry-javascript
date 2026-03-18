import type { Nuxt } from '@nuxt/schema';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import type { ConfigEnv, Plugin, UserConfig } from 'vite';
import type { SentryNuxtModuleOptions } from '../common/types';
import { extractNuxtSourceMapSetting, getPluginOptions, validateDifferentSourceMapSettings } from './sourceMaps';

/**
 * Creates a Vite plugin that adds the Sentry Vite plugin and validates source map settings.
 */
export function validateSourceMapsOptionsPlugin(options: {
  nuxt: Nuxt;
  moduleOptions: SentryNuxtModuleOptions;
  sourceMapsEnabled: boolean;
}): Plugin {
  const { nuxt, moduleOptions, sourceMapsEnabled } = options;
  const isDebug = moduleOptions.debug;

  return {
    name: 'sentry-nuxt-source-map-validation',
    config(viteConfig: UserConfig, env: ConfigEnv) {
      // Only run in production builds
      if (!sourceMapsEnabled || env.mode === 'development' || nuxt.options?._prepare) {
        return;
      }

      // Detect runtime from Vite config
      // In Nuxt, SSR builds have build.ssr: true, client builds don't
      const runtime = viteConfig.build?.ssr ? 'server' : 'client';

      const nuxtSourceMapSetting = extractNuxtSourceMapSetting(nuxt, runtime);

      // Initialize build config if needed
      viteConfig.build = viteConfig.build || {};
      const viteSourceMap = viteConfig.build.sourcemap;

      if (isDebug) {
        // eslint-disable-next-line no-console
        console.log(`[Sentry] Validating Vite config for the ${runtime} runtime.`);
      }

      // Vite source map options are the same as the Nuxt source map config options (unless overwritten)
      validateDifferentSourceMapSettings({
        nuxtSettingKey: `sourcemap.${runtime}`,
        nuxtSettingValue: nuxtSourceMapSetting,
        otherSettingKey: 'viteConfig.build.sourcemap',
        otherSettingValue: viteSourceMap,
      });
    },
  };
}
