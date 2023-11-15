import {
  addTracingExtensions,
  captureException,
  getCurrentHub,
  runWithAsyncContext,
  startTransaction,
} from '@sentry/core';
import type { Transaction } from '@sentry/types';
import {
  addExceptionMechanism,
  isString,
  logger,
  objectify,
  stripUrlQueryAndFragment,
  tracingContextFromHeaders,
} from '@sentry/utils';

import type { AugmentedNextApiRequest, AugmentedNextApiResponse, NextApiHandler } from './types';
import { platformSupportsStreaming } from './utils/platformSupportsStreaming';
import { autoEndTransactionOnResponseEnd, finishTransaction, flushQueue } from './utils/responseEnd';

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
    apply: (wrappingTarget, thisArg, args: Parameters<NextApiHandler>) => {
      // eslint-disable-next-line deprecation/deprecation
      return withSentry(wrappingTarget, parameterizedRoute).apply(thisArg, args);
    },
  });
}

/**
 * @deprecated Use `wrapApiHandlerWithSentry()` instead
 */
export const withSentryAPI = wrapApiHandlerWithSentry;

/**
 * Legacy function for manually wrapping API route handlers, now used as the innards of `wrapApiHandlerWithSentry`.
 *
 * @param apiHandler The user's original API route handler
 * @param parameterizedRoute The route whose handler is being wrapped. Meant for internal use only.
 * @returns A wrapped version of the handler
 *
 * @deprecated Use `wrapApiWithSentry()` instead
 */
export function withSentry(apiHandler: NextApiHandler, parameterizedRoute?: string): NextApiHandler {
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

      // eslint-disable-next-line complexity, @typescript-eslint/no-explicit-any
      const boundHandler = runWithAsyncContext(
        // eslint-disable-next-line complexity
        async () => {
          const hub = getCurrentHub();
          let transaction: Transaction | undefined;
          const currentScope = hub.getScope();
          const options = hub.getClient()?.getOptions();

          currentScope.setSDKProcessingMetadata({ request: req });

          if (options?.instrumenter === 'sentry') {
            const sentryTrace =
              req.headers && isString(req.headers['sentry-trace']) ? req.headers['sentry-trace'] : undefined;
            const baggage = req.headers?.baggage;
            const { traceparentData, dynamicSamplingContext, propagationContext } = tracingContextFromHeaders(
              sentryTrace,
              baggage,
            );
            currentScope.setPropagationContext(propagationContext);

            if (__DEBUG_BUILD__ && traceparentData) {
              logger.log(`[Tracing] Continuing trace ${traceparentData.traceId}.`);
            }

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

            transaction = startTransaction(
              {
                name: `${reqMethod}${reqPath}`,
                op: 'http.server',
                origin: 'auto.http.nextjs',
                ...traceparentData,
                metadata: {
                  dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
                  source: 'route',
                  request: req,
                },
              },
              // extra context passed to the `tracesSampler`
              { request: req },
            );
            currentScope.setSpan(transaction);
            if (platformSupportsStreaming() && !wrappingTarget.__sentry_test_doesnt_support_streaming__) {
              autoEndTransactionOnResponseEnd(transaction, res);
            } else {
              // If we're not on a platform that supports streaming, we're blocking res.end() until the queue is flushed.
              // res.json() and res.send() will implicitly call res.end(), so it is enough to wrap res.end().

              // eslint-disable-next-line @typescript-eslint/unbound-method
              const origResEnd = res.end;
              res.end = async function (this: unknown, ...args: unknown[]) {
                if (transaction) {
                  await finishTransaction(transaction, res);
                  await flushQueue();
                }

                origResEnd.apply(this, args);
              };
            }
          }

          try {
            const handlerResult = await wrappingTarget.apply(thisArg, args);

            if (
              process.env.NODE_ENV === 'development' &&
              !process.env.SENTRY_IGNORE_API_RESOLUTION_ERROR &&
              !res.finished
              // This can only happen (not always) when the user is using `withSentry` manually, which we're deprecating.
              // Warning suppression on Next.JS is only necessary in that case.
            ) {
              // eslint-disable-next-line no-console
              console.warn(
                `[sentry] If Next.js logs a warning "API resolved without sending a response", it's a false positive, which may happen when you use \`withSentry\` manually to wrap your routes.
              To suppress this warning, set \`SENTRY_IGNORE_API_RESOLUTION_ERROR\` to 1 in your env.
              To suppress the nextjs warning, use the \`externalResolver\` API route option (see https://nextjs.org/docs/api-routes/api-middlewares#custom-config for details).`,
              );
            }

            return handlerResult;
          } catch (e) {
            // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
            // store a seen flag on it. (Because of the one-way-on-Vercel-one-way-off-of-Vercel approach we've been forced
            // to take, it can happen that the same thrown object gets caught in two different ways, and flagging it is a
            // way to prevent it from actually being reported twice.)
            const objectifiedErr = objectify(e);

            currentScope.addEventProcessor(event => {
              addExceptionMechanism(event, {
                type: 'instrument',
                handled: false,
                data: {
                  wrapped_handler: wrappingTarget.name,
                  function: 'withSentry',
                },
              });
              return event;
            });

            captureException(objectifiedErr);

            // Because we're going to finish and send the transaction before passing the error onto nextjs, it won't yet
            // have had a chance to set the status to 500, so unless we do it ourselves now, we'll incorrectly report that
            // the transaction was error-free
            res.statusCode = 500;
            res.statusMessage = 'Internal Server Error';

            // Make sure we have a chance to finish the transaction and flush events to Sentry before the handler errors
            // out. (Apps which are deployed on Vercel run their API routes in lambdas, and those lambdas will shut down the
            // moment they detect an error, so it's important to get this done before rethrowing the error. Apps not
            // deployed serverlessly will run into this cleanup code again in `res.end(), but the transaction will already
            // be finished and the queue will already be empty, so effectively it'll just no-op.)
            if (platformSupportsStreaming() && !wrappingTarget.__sentry_test_doesnt_support_streaming__) {
              void finishTransaction(transaction, res);
            } else {
              await finishTransaction(transaction, res);
              await flushQueue();
            }

            // We rethrow here so that nextjs can do with the error whatever it would normally do. (Sometimes "whatever it
            // would normally do" is to allow the error to bubble up to the global handlers - another reason we need to mark
            // the error as already having been captured.)
            throw objectifiedErr;
          }
        },
      );

      // Since API route handlers are all async, nextjs always awaits the return value (meaning it's fine for us to return
      // a promise here rather than a real result, and it saves us the overhead of an `await` call.)
      return boundHandler;
    },
  });
}
