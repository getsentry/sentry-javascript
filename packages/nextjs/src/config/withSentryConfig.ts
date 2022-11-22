import type { ExportedNextConfig, NextConfigFunction, NextConfigObject, SentryWebpackPluginOptions } from './types';
import { constructWebpackConfigFunction } from './webpack';

/**
 * Add Sentry options to the config to be exported from the user's `next.config.js` file.
 *
 * @param exportedUserNextConfig The existing config to be exported prior to adding Sentry
 * @param userSentryWebpackPluginOptions Configuration for SentryWebpackPlugin
 * @returns The modified config to be exported
 */
export function withSentryConfig(
  exportedUserNextConfig: ExportedNextConfig = {},
  userSentryWebpackPluginOptions: Partial<SentryWebpackPluginOptions> = {},
): NextConfigFunction | NextConfigObject {
  // If the user has passed us a function, we need to return a function, so that we have access to `phase` and
  // `defaults` in order to pass them along to the user's function
  if (typeof exportedUserNextConfig === 'function') {
    return function (phase: string, defaults: { defaultConfig: NextConfigObject }): NextConfigObject {
      let userNextConfigObject = exportedUserNextConfig(phase, defaults);

      // Next 12.2.3+ warns about non-canonical properties on `userNextConfig`, so grab and then remove the `sentry`
      // property there. Where we actually need it is in the webpack config function we're going to create, so pass it
      // to `constructWebpackConfigFunction` so that it will be in the created function's closure.
      const { sentry: userSentryOptions } = userNextConfigObject;
      delete userNextConfigObject.sentry;
      // Remind TS that there's now no `sentry` property
      userNextConfigObject = userNextConfigObject as NextConfigObject;

      return {
        ...userNextConfigObject,
        webpack: constructWebpackConfigFunction(
          userNextConfigObject,
          userSentryWebpackPluginOptions,
          userSentryOptions,
        ),
      };
    };
  }

  // Otherwise, we can just merge their config with ours and return an object.

  // Prevent nextjs from getting mad about having a non-standard config property in `userNextConfig`. (See note above
  // for a more thorough explanation of what we're doing here.)
  const { sentry: userSentryOptions } = exportedUserNextConfig;
  delete exportedUserNextConfig.sentry;
  // Remind TS that there's now no `sentry` property
  const userNextConfigObject = exportedUserNextConfig as NextConfigObject;

  return {
    ...userNextConfigObject,
    webpack: constructWebpackConfigFunction(userNextConfigObject, userSentryWebpackPluginOptions, userSentryOptions),
  };
}
