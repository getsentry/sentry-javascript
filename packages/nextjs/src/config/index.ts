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
): NextConfigFunction | Partial<NextConfigObject> {
  // If the user has passed us a function, we need to return a function, so that we have access to `phase` and
  // `defaults` in order to pass them along to the user's function
  if (typeof userNextConfig === 'function') {
    return function (phase: string, defaults: { defaultConfig: NextConfigObject }): Partial<NextConfigObject> {
      const materializedUserNextConfig = userNextConfig(phase, defaults);
      return {
        ...materializedUserNextConfig,
        webpack: constructWebpackConfigFunction(materializedUserNextConfig, userSentryWebpackPluginOptions),
      };
    };
  }

  // Otherwise, we can just merge their config with ours and return an object.
  return {
    ...userNextConfig,
    webpack: constructWebpackConfigFunction(userNextConfig, userSentryWebpackPluginOptions),
  };
}
