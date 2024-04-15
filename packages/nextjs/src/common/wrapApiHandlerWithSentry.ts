import { captureException } from '@sentry/core';

import type { AugmentedNextApiRequest, AugmentedNextApiResponse, NextApiHandler } from './types';
import { platformSupportsStreaming } from './utils/platformSupportsStreaming';
import { flushQueue } from './utils/responseEnd';
import { withIsolationScopeOrReuseFromRootSpan } from './utils/withIsolationScopeOrReuseFromRootSpan';

/**
 * Wrap the given API route handler for tracing and error capturing. Thin wrapper around `withSentry`, which only
 * applies it if it hasn't already been applied.
 *
 * @param apiHandler The handler exported from the user's API page route file, which may or may not already be
 * wrapped with `withSentry`
 * @param parameterizedRoute The page's route, passed in via the proxy loader
 * @returns The wrapped handler
 */
export function wrapApiHandlerWithSentry(apiHandler: NextApiHandler): NextApiHandler {
  return new Proxy(apiHandler, {
    apply: (
      wrappingTarget,
      thisArg,
      args: [AugmentedNextApiRequest | undefined, AugmentedNextApiResponse | undefined],
    ) => {
      const [req] = args;
      return withIsolationScopeOrReuseFromRootSpan(async isolationScope => {
        isolationScope.setSDKProcessingMetadata({ request: req });
        try {
          const handlerResult = await wrappingTarget.apply(thisArg, args);

          return handlerResult;
        } catch (e) {
          captureException(e, {
            mechanism: {
              type: 'instrument',
              handled: false,
            },
          });

          // Make sure we have a chance to finish the transaction and flush events to Sentry before the handler errors
          // out. (Apps which are deployed on Vercel run their API routes in lambdas, and those lambdas will shut down the
          // moment they detect an error, so it's important to get this done before rethrowing the error. Apps not
          // deployed serverlessly will run into this cleanup code again in `res.end(), but the transaction will already
          // be finished and the queue will already be empty, so effectively it'll just no-op.)
          if (platformSupportsStreaming() && !wrappingTarget.__sentry_test_doesnt_support_streaming__) {
            await flushQueue();
          }

          // We rethrow here so that nextjs can do with the error whatever it would normally do. (Sometimes "whatever it
          // would normally do" is to allow the error to bubble up to the global handlers - another reason we need to mark
          // the error as already having been captured.)
          throw e;
        }
      });
    },
  });
}
