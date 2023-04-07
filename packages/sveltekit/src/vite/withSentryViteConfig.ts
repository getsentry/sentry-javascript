import type { UserConfig, UserConfigExport } from 'vite';

import { injectSentryInitPlugin } from './injectInitPlugin';
import { hasSentryInitFiles } from './utils';

/**
 * This function adds Sentry-specific configuration to your Vite config.
 * Pass your config to this function and make sure the return value is exported
 * from your `vite.config.js` file.
 *
 * Note: If you're already wrapping your config with another wrapper,
 * for instance with `defineConfig` from vitest, make sure
 * that the Sentry wrapper is the outermost one.
 *
 * @param originalConfig your original vite config
 *
 * @returns a vite config with Sentry-specific configuration added to it.
 */
export function withSentryViteConfig(originalConfig: UserConfigExport): UserConfigExport {
  if (typeof originalConfig === 'function') {
    return function (this: unknown, ...viteConfigFunctionArgs: unknown[]): UserConfig | Promise<UserConfig> {
      const userViteConfigObject = originalConfig.apply(this, viteConfigFunctionArgs);
      if (userViteConfigObject instanceof Promise) {
        return userViteConfigObject.then(userConfig => addSentryConfig(userConfig));
      }
      return addSentryConfig(userViteConfigObject);
    };
  } else if (originalConfig instanceof Promise) {
    return originalConfig.then(userConfig => addSentryConfig(userConfig));
  }
  return addSentryConfig(originalConfig);
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
