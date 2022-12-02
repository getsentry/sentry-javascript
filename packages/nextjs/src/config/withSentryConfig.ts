import { NEXT_PHASE_DEVELOPMENT_SERVER, NEXT_PHASE_PRODUCTION_BUILD } from '../utils/phases';
import type {
  ExportedNextConfig,
  NextConfigFunction,
  NextConfigObject,
  NextConfigObjectWithSentry,
  SentryWebpackPluginOptions,
} from './types';

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

  if (typeof exportedUserNextConfig === 'function') {
    return function (phase: string, defaults: { defaultConfig: NextConfigObject }): NextConfigObject {
      const userNextConfigObject = exportedUserNextConfig(phase, defaults);
      return getFinalConfigObject(phase, userNextConfigObject, userSentryWebpackPluginOptions);
    };
  } else {
    return getFinalConfigObject(undefined, exportedUserNextConfig, userSentryWebpackPluginOptions);
  }

}

// Modify the materialized object form of the user's next config by deleting the `sentry` property and wrapping the
// `webpack` property
function getFinalConfigObject(
  phase: string | undefined,
  incomingUserNextConfigObject: NextConfigObjectWithSentry,
  userSentryWebpackPluginOptions: Partial<SentryWebpackPluginOptions>,
): NextConfigObject {
  // Next 12.2.3+ warns about non-canonical properties on `userNextConfig`, so grab and then remove the `sentry`
  // property there. Where we actually need it is in the webpack config function we're going to create, so pass it
  // to `constructWebpackConfigFunction` so that it can live in the returned function's closure.
  const { sentry: userSentryOptions } = incomingUserNextConfigObject;
  delete incomingUserNextConfigObject.sentry;
  // Remind TS that there's now no `sentry` property
  const userNextConfigObject = incomingUserNextConfigObject as NextConfigObject;

  // In order to prevent all of our build-time code from being bundled in people's route-handling serverless functions,
  // we exclude `webpack.ts` and all of its dependencies from nextjs's `@vercel/nft` filetracing. We therefore need to
  // make sure that we only require it at build time or in development mode.
  if (phase === NEXT_PHASE_PRODUCTION_BUILD || phase === NEXT_PHASE_DEVELOPMENT_SERVER) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { constructWebpackConfigFunction } = require('./webpack');
    return {
      ...userNextConfigObject,
      webpack: constructWebpackConfigFunction(userNextConfigObject, userSentryWebpackPluginOptions, userSentryOptions),
    };
  }

  // At runtime, we just return the user's config untouched.
  return userNextConfigObject;
}
