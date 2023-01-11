import { NEXT_PHASE_DEVELOPMENT_SERVER, NEXT_PHASE_PRODUCTION_BUILD } from '../utils/phases';
import type {
  ExportedNextConfig,
  NextConfigFunction,
  NextConfigObject,
  NextConfigObjectWithSentry,
  SentryWebpackPluginOptions,
  UserSentryOptions,
} from './types';

/**
 * Add Sentry options to the config to be exported from the user's `next.config.js` file.
 *
 * @param exportedUserNextConfig The existing config to be exported prior to adding Sentry
 * @param userSentryWebpackPluginOptions Configuration for SentryWebpackPlugin
 * @param sentryOptions Optional additional options to add as alternative to `sentry` property of config
 * @returns The modified config to be exported
 */
export function withSentryConfig(
  exportedUserNextConfig: ExportedNextConfig = {},
  userSentryWebpackPluginOptions: Partial<SentryWebpackPluginOptions> = {},
  sentryOptions?: UserSentryOptions,
): NextConfigFunction | NextConfigObject {
  return function (phase: string, defaults: { defaultConfig: NextConfigObject }): NextConfigObject {
    const userNextConfigObject =
      typeof exportedUserNextConfig === 'function' ? exportedUserNextConfig(phase, defaults) : exportedUserNextConfig;
    // Inserts additional `sentry` options into the existing config, allows for backwards compatability
    // in case nothing is passed into the optional `sentryOptions` argument
    userNextConfigObject.sentry = { ...userNextConfigObject.sentry, ...sentryOptions };
    return getFinalConfigObject(phase, userNextConfigObject, userSentryWebpackPluginOptions);
  };
}

// Modify the materialized object form of the user's next config by deleting the `sentry` property and wrapping the
// `webpack` property
function getFinalConfigObject(
  phase: string,
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

  if (userSentryOptions?.tunnelRoute) {
    setUpTunnelRewriteRules(userNextConfigObject, userSentryOptions.tunnelRoute);
  }

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

/**
 * Injects rewrite rules into the Next.js config provided by the user to tunnel
 * requests from the `tunnelPath` to Sentry.
 *
 * See https://nextjs.org/docs/api-reference/next.config.js/rewrites.
 */
function setUpTunnelRewriteRules(userNextConfig: NextConfigObject, tunnelPath: string): void {
  const originalRewrites = userNextConfig.rewrites;

  // This function doesn't take any arguments at the time of writing but we future-proof
  // here in case Next.js ever decides to pass some
  userNextConfig.rewrites = async (...args: unknown[]) => {
    const injectedRewrite = {
      // Matched rewrite routes will look like the following: `[tunnelPath]?o=[orgid]&p=[projectid]`
      // Nextjs will automatically convert `source` into a regex for us
      source: `${tunnelPath}(/?)`,
      has: [
        {
          type: 'query',
          key: 'o', // short for orgId - we keep it short so matching is harder for ad-blockers
          value: '(?<orgid>.*)',
        },
        {
          type: 'query',
          key: 'p', // short for projectId - we keep it short so matching is harder for ad-blockers
          value: '(?<projectid>.*)',
        },
      ],
      destination: 'https://o:orgid.ingest.sentry.io/api/:projectid/envelope/',
    };

    if (typeof originalRewrites !== 'function') {
      return [injectedRewrite];
    }

    // @ts-ignore Expected 0 arguments but got 1 - this is from the future-proofing mentioned above, so we don't care about it
    const originalRewritesResult = await originalRewrites(...args);

    if (Array.isArray(originalRewritesResult)) {
      return [injectedRewrite, ...originalRewritesResult];
    } else {
      return {
        ...originalRewritesResult,
        beforeFiles: [injectedRewrite, ...originalRewritesResult.beforeFiles],
      };
    }
  };
}
