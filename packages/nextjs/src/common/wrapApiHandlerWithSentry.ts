import {
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  addTracingExtensions,
  captureException,
  continueTrace,
  setHttpStatus,
  startSpanManual,
} from '@sentry/core';
import { consoleSandbox, isString, logger, objectify, stripUrlQueryAndFragment } from '@sentry/utils';

import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
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
export function wrapApiHandlerWithSentry(apiHandler: NextApiHandler, parameterizedRoute: string): NextApiHandler {
  return new Proxy(apiHandler, {
    apply: (
      wrappingTarget,
      thisArg,
      args: [AugmentedNextApiRequest | undefined, AugmentedNextApiResponse | undefined],
    ) => {
      const [req, res] = args;

      if (!req) {
        logger.debug(
          `Wrapped API handler on route "${parameterizedRoute}" was not passed a request object. Will not instrument.`,
        );
        return wrappingTarget.apply(thisArg, args);
      } else if (!res) {
        logger.debug(
          `Wrapped API handler on route "${parameterizedRoute}" was not passed a response object. Will not instrument.`,
        );
        return wrappingTarget.apply(thisArg, args);
      }

      // We're now auto-wrapping API route handlers using `wrapApiHandlerWithSentry` (which uses `withSentry` under the hood), but
      // users still may have their routes manually wrapped with `withSentry`. This check makes `sentryWrappedHandler`
      // idempotent so that those cases don't break anything.
      if (req.__withSentry_applied__) {
        return wrappingTarget.apply(thisArg, args);
      }
      req.__withSentry_applied__ = true;

      addTracingExtensions();

      return withIsolationScopeOrReuseFromRootSpan(isolationScope => {
        return continueTrace(
          {
            // TODO(v8): Make it so that continue trace will allow null as sentryTrace value and remove this fallback here
            sentryTrace: req.headers && isString(req.headers['sentry-trace']) ? req.headers['sentry-trace'] : undefined,
            baggage: req.headers?.baggage,
          },
          () => {
            // prefer the parameterized route, if we have it (which we will if we've auto-wrapped the route handler)
            let reqPath = parameterizedRoute;

            // If not, fake it by just replacing parameter values with their names, hoping that none of them match either
            // each other or any hard-coded parts of the path
            if (!reqPath) {
              const url = `${req.url}`;
              // pull off query string, if any
              reqPath = stripUrlQueryAndFragment(url);
              // Replace with placeholder
              if (req.query) {
                for (const [key, value] of Object.entries(req.query)) {
                  reqPath = reqPath.replace(`${value}`, `[${key}]`);
                }
              }
            }

            const reqMethod = `${(req.method || 'GET').toUpperCase()} `;

            isolationScope.setSDKProcessingMetadata({ request: req });

            return startSpanManual(
              {
                name: `${reqMethod}${reqPath}`,
                op: 'http.server',
                forceTransaction: true,
                attributes: {
                  [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.nextjs',
                },
              },
              async span => {
                // eslint-disable-next-line @typescript-eslint/unbound-method
                res.end = new Proxy(res.end, {
                  apply(target, thisArg, argArray) {
                    setHttpStatus(span, res.statusCode);
                    span.end();
                    if (platformSupportsStreaming() && !wrappingTarget.__sentry_test_doesnt_support_streaming__) {
                      target.apply(thisArg, argArray);
                    } else {
                      // flushQueue will not reject
                      // eslint-disable-next-line @typescript-eslint/no-floating-promises
                      flushQueue().then(() => {
                        target.apply(thisArg, argArray);
                      });
                    }
                  },
                });

                try {
                  const handlerResult = await wrappingTarget.apply(thisArg, args);
                  if (
                    process.env.NODE_ENV === 'development' &&
                    !process.env.SENTRY_IGNORE_API_RESOLUTION_ERROR &&
                    !res.writableEnded
                  ) {
                    consoleSandbox(() => {
                      // eslint-disable-next-line no-console
                      console.warn(
                        '[sentry] If Next.js logs a warning "API resolved without sending a response", it\'s a false positive, which may happen when you use `wrapApiHandlerWithSentry` manually to wrap your routes. To suppress this warning, set `SENTRY_IGNORE_API_RESOLUTION_ERROR` to 1 in your env. To suppress the nextjs warning, use the `externalResolver` API route option (see https://nextjs.org/docs/api-routes/api-middlewares#custom-config for details).',
                      );
                    });
                  }

                  return handlerResult;
                } catch (e) {
                  // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
                  // store a seen flag on it. (Because of the one-way-on-Vercel-one-way-off-of-Vercel approach we've been forced
                  // to take, it can happen that the same thrown object gets caught in two different ways, and flagging it is a
                  // way to prevent it from actually being reported twice.)
                  const objectifiedErr = objectify(e);

                  captureException(objectifiedErr, {
                    mechanism: {
                      type: 'instrument',
                      handled: false,
                      data: {
                        wrapped_handler: wrappingTarget.name,
                        function: 'withSentry',
                      },
                    },
                  });

                  // Because we're going to finish and send the transaction before passing the error onto nextjs, it won't yet
                  // have had a chance to set the status to 500, so unless we do it ourselves now, we'll incorrectly report that
                  // the transaction was error-free
                  res.statusCode = 500;
                  res.statusMessage = 'Internal Server Error';

                  setHttpStatus(span, res.statusCode);
                  span.end();

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
                  throw objectifiedErr;
                }
              },
            );
          },
        );
      });
    },
  });
}
