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
): NextConfigFunction {
  const newWebpackExport = constructWebpackConfigFunction(userNextConfig, userSentryWebpackPluginOptions);

  const finalNextConfig = (
    phase: string,
    defaults: { defaultConfig: { [key: string]: unknown } },
  ): NextConfigObject => {
    const materializedUserNextConfig =
      typeof userNextConfig === 'function' ? userNextConfig(phase, defaults) : userNextConfig;

    return {
      ...materializedUserNextConfig,
      // TODO When we add a way to disable the webpack plugin, doing so should turn this off, too
      productionBrowserSourceMaps: true,
      webpack: newWebpackExport,
    };
  };

  return finalNextConfig;
}
