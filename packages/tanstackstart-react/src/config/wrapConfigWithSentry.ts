import type { UserConfig } from 'vite';
import type { SentryTanstackStartReactPluginOptions } from './types';

/**
 * Wraps a Vite configuration with Sentry build-time enhancements such as
 * automatic source maps upload.
 *
 * @param config - A Vite configuration object
 * @param sentryPluginOptions - Options to configure the Sentry Vite plugin
 * @returns The modified Vite config
 */
export function wrapConfigWithSentry(
  config: UserConfig,
  _sentryPluginOptions: SentryTanstackStartReactPluginOptions = {},
): UserConfig {
  // TODO: Add Sentry Vite plugins for source map upload
  console.log('wrapConfigWithSentry', config, _sentryPluginOptions);
  return config;
}
