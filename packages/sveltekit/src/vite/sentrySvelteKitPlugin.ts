import type { Plugin, UserConfig } from 'vite';

import { injectSentryInitPlugin } from './injectInitPlugin';
import { hasSentryInitFiles } from './utils';

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
  const sentryPlugins = [];

  const shouldAddInjectInitPlugin = hasSentryInitFiles();

  if (shouldAddInjectInitPlugin) {
    sentryPlugins.push(injectSentryInitPlugin);
  }

  const config = {
    ...originalConfig,
    plugins: originalConfig.plugins ? [...sentryPlugins, ...originalConfig.plugins] : [...sentryPlugins],
  };

  const mergedDevServerFileSystemConfig: UserConfig['server'] = shouldAddInjectInitPlugin
    ? {
        fs: {
          ...(config.server && config.server.fs),
          allow: [...((config.server && config.server.fs && config.server.fs.allow) || []), '.'],
        },
      }
    : {};

  config.server = {
    ...config.server,
    ...mergedDevServerFileSystemConfig,
  };

  return config;
}
