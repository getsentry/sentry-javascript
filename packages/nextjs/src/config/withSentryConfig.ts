import { isThenable } from '@sentry/utils';

import type {
  ExportedNextConfig as NextConfig,
  NextConfigFunction,
  NextConfigObject,
  SentryBuildOptions,
} from './types';
import { constructWebpackConfigFunction } from './webpack';

let showedExportModeTunnelWarning = false;

/**
 * Modifies the passed in Next.js configuration with automatic build-time instrumentation and source map upload.
 *
 * @param nextConfig A Next.js configuration object, as usually exported in `next.config.js` or `next.config.mjs`.
 * @param sentryWebpackPluginOptions Options to configure the automatically included Sentry Webpack Plugin for source maps and release management in Sentry.
 * @param sentryBuildOptions Additional options to configure instrumentation and
 * @returns The modified config to be exported
 */
export function withSentryConfig<C>(nextConfig?: C, sentryBuildOptions: SentryBuildOptions = {}): C {
  const castNextConfig = (nextConfig as NextConfig) || {};
  if (typeof castNextConfig === 'function') {
    return function (this: unknown, ...webpackConfigFunctionArgs: unknown[]): ReturnType<NextConfigFunction> {
      const maybePromiseNextConfig: ReturnType<typeof castNextConfig> = castNextConfig.apply(
        this,
        webpackConfigFunctionArgs,
      );

      if (isThenable(maybePromiseNextConfig)) {
        return maybePromiseNextConfig.then(promiseResultNextConfig => {
          return getFinalConfigObject(promiseResultNextConfig, sentryBuildOptions);
        });
      }

      return getFinalConfigObject(maybePromiseNextConfig, sentryBuildOptions);
    } as C;
  } else {
    return getFinalConfigObject(castNextConfig, sentryBuildOptions) as C;
  }
}

// Modify the materialized object form of the user's next config by deleting the `sentry` property and wrapping the
// `webpack` property
function getFinalConfigObject(
  incomingUserNextConfigObject: NextConfigObject,
  userSentryOptions: SentryBuildOptions,
): NextConfigObject {
  if ('sentry' in incomingUserNextConfigObject) {
    // eslint-disable-next-line no-console
    console.warn(
      '[@sentry/nextjs] Setting a `sentry` property on the Next.js config is no longer supported. Please use the `sentrySDKOptions` argument of `withSentryConfig` instead.',
    );

    // Next 12.2.3+ warns about non-canonical properties on `userNextConfig`.
    delete incomingUserNextConfigObject.sentry;
  }

  if (userSentryOptions?.tunnelRoute) {
    if (incomingUserNextConfigObject.output === 'export') {
      if (!showedExportModeTunnelWarning) {
        showedExportModeTunnelWarning = true;
        // eslint-disable-next-line no-console
        console.warn(
          '[@sentry/nextjs] The Sentry Next.js SDK `tunnelRoute` option will not work in combination with Next.js static exports. The `tunnelRoute` option uses serverside features that cannot be accessed in export mode. If you still want to tunnel Sentry events, set up your own tunnel: https://docs.sentry.io/platforms/javascript/troubleshooting/#using-the-tunnel-option',
        );
      }
    } else {
      setUpTunnelRewriteRules(incomingUserNextConfigObject, userSentryOptions.tunnelRoute);
    }
  }

  // We need to enable `instrumentation.ts` for users because we tell them to put their `Sentry.init()` calls inside of it.
  if (incomingUserNextConfigObject.experimental?.instrumentationHook === false) {
    // eslint-disable-next-line no-console
    console.warn(
      '[@sentry/nextjs] You turned off the `instrumentationHook` option. Note that Sentry will not be initialized if you did not set it up inside `instrumentation.ts`.',
    );
  }
  incomingUserNextConfigObject.experimental = {
    instrumentationHook: true,
    ...incomingUserNextConfigObject.experimental,
  };

  return {
    ...incomingUserNextConfigObject,
    webpack: constructWebpackConfigFunction(incomingUserNextConfigObject, userSentryOptions),
  };
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
    const tunnelRouteRewrite = {
      // Matched rewrite routes will look like the following: `[tunnelPath]?o=[orgid]&p=[projectid]`
      // Nextjs will automatically convert `source` into a regex for us
      source: `${tunnelPath}(/?)`,
      has: [
        {
          type: 'query',
          key: 'o', // short for orgId - we keep it short so matching is harder for ad-blockers
          value: '(?<orgid>\\d*)',
        },
        {
          type: 'query',
          key: 'p', // short for projectId - we keep it short so matching is harder for ad-blockers
          value: '(?<projectid>\\d*)',
        },
      ],
      destination: 'https://o:orgid.ingest.sentry.io/api/:projectid/envelope/?hsts=0',
    };

    const tunnelRouteRewriteWithRegion = {
      // Matched rewrite routes will look like the following: `[tunnelPath]?o=[orgid]&p=[projectid]?r=[region]`
      // Nextjs will automatically convert `source` into a regex for us
      source: `${tunnelPath}(/?)`,
      has: [
        {
          type: 'query',
          key: 'o', // short for orgId - we keep it short so matching is harder for ad-blockers
          value: '(?<orgid>\\d*)',
        },
        {
          type: 'query',
          key: 'p', // short for projectId - we keep it short so matching is harder for ad-blockers
          value: '(?<projectid>\\d*)',
        },
        {
          type: 'query',
          key: 'r', // short for region - we keep it short so matching is harder for ad-blockers
          value: '(?<region>[a-z]{2})',
        },
      ],
      destination: 'https://o:orgid.ingest.:region.sentry.io/api/:projectid/envelope/?hsts=0',
    };

    // Order of these is important, they get applied first to last.
    const newRewrites = [tunnelRouteRewriteWithRegion, tunnelRouteRewrite];

    if (typeof originalRewrites !== 'function') {
      return newRewrites;
    }

    // @ts-expect-error Expected 0 arguments but got 1 - this is from the future-proofing mentioned above, so we don't care about it
    const originalRewritesResult = await originalRewrites(...args);

    if (Array.isArray(originalRewritesResult)) {
      return [...newRewrites, ...originalRewritesResult];
    } else {
      return {
        ...originalRewritesResult,
        beforeFiles: [...newRewrites, ...(originalRewritesResult.beforeFiles || [])],
      };
    }
  };
}
