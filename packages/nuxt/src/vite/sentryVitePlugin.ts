import type { Nuxt } from '@nuxt/schema';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import type { ConfigEnv, Plugin, UserConfig } from 'vite';
import type { SentryNuxtModuleOptions } from '../common/types';
import { extractNuxtSourceMapSetting, getPluginOptions, validateDifferentSourceMapSettings } from './sourceMaps';

/**
 * Creates a Vite plugin that adds the Sentry Vite plugin and validates source map settings.
 */
export function createSentryViteConfigPlugin(options: {
  nuxt: Nuxt;
  moduleOptions: SentryNuxtModuleOptions;
  sourceMapsEnabled: boolean;
  shouldDeleteFilesFallback: { client: boolean; server: boolean };
}): Plugin {
  const { nuxt, moduleOptions, sourceMapsEnabled, shouldDeleteFilesFallback } = options;
  const isDebug = moduleOptions.debug;

  return {
    name: 'sentry-nuxt-vite-config',
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

      // Vite source map options are the same as the Nuxt source map config options (unless overwritten)
      validateDifferentSourceMapSettings({
        nuxtSettingKey: `sourcemap.${runtime}`,
        nuxtSettingValue: nuxtSourceMapSetting,
        otherSettingKey: 'viteConfig.build.sourcemap',
        otherSettingValue: viteSourceMap,
      });

      if (isDebug) {
        // eslint-disable-next-line no-console
        console.log(`[Sentry] Adding Sentry Vite plugin to the ${runtime} runtime.`);
      }

      // Add Sentry plugin by mutating the config
      // Vite plugin is added on the client and server side (plugin runs for both builds)
      // Nuxt client source map is 'false' by default. Warning about this will be shown already in an earlier step, and it's also documented that `nuxt.sourcemap.client` needs to be enabled.
      viteConfig.plugins = viteConfig.plugins || [];
      viteConfig.plugins.push(sentryVitePlugin(getPluginOptions(moduleOptions, shouldDeleteFilesFallback)));
    },
  };
}
