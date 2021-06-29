import { ExportedNextConfig, NextConfigFunction, NextConfigObject, SentryWebpackPluginOptions } from './types';
import { constructWebpackConfigFunction } from './webpack';

/**
 * Add Sentry options to the config to be exported from the user's `next.config.js` file.
 *
 * @param userNextConfig The existing config to be exported prior to adding Sentry
 * @param userSentryWebpackPluginOptions Configuration for SentryWebpackPlugin
 * @returns The modified config to be exported
 */
export function withSentryConfig(
  userNextConfig: ExportedNextConfig = {},
  userSentryWebpackPluginOptions: Partial<SentryWebpackPluginOptions> = {},
): NextConfigFunction | NextConfigObject {
  const partialConfig = {
    // TODO When we add a way to disable the webpack plugin, doing so should turn this off, too
    productionBrowserSourceMaps: true,
    webpack: constructWebpackConfigFunction(userNextConfig, userSentryWebpackPluginOptions),
  };

  // If the user has passed us a function, we need to return a function, so that we have access to `phase` and
  // `defaults` in order to pass them along to the user's function
  if (typeof userNextConfig === 'function') {
    return (phase: string, defaults: { defaultConfig: { [key: string]: unknown } }): NextConfigObject => ({
      ...userNextConfig(phase, defaults),
      ...partialConfig,
    });
  }

  // Otherwise, we can just merge their config with ours and return an object.
  return { ...userNextConfig, ...partialConfig };
}
