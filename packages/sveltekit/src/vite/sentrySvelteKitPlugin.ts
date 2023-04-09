import type { Plugin, UserConfig } from 'vite';

/**
 * Vite Plugin for the Sentry SvelteKit SDK, taking care of:
 *
 * - Creating Sentry releases and uploading source maps to Sentry
 * - Injecting Sentry.init calls if you use dedicated `sentry.(client|server).config.ts` files
 *
 * This plugin adds a few additional properties to your Vite config.
 * Make sure, it is registered before the SvelteKit plugin.
 */
export function sentrySvelteKitPlugin(): Plugin {
  return {
    name: 'sentry-sveltekit',
    enforce: 'pre', // we want this plugin to run early enough
    config: originalConfig => {
      return addSentryConfig(originalConfig);
    },
  };
}

function addSentryConfig(originalConfig: UserConfig): UserConfig {
  const sentryPlugins: Plugin[] = [];

  // TODO: Add sentry vite plugin here

  const config: UserConfig = {
    ...originalConfig,
    plugins: [...sentryPlugins, ...(originalConfig.plugins || [])],
  };

  return config;
}
