import { captureException } from '@sentry/core';
import { getCurrentHub, startTransaction } from '@sentry/node';
import { extractTraceparentData, hasTracingEnabled } from '@sentry/tracing';
import {
  addExceptionMechanism,
  baggageHeaderToDynamicSamplingContext,
  isString,
  logger,
  objectify,
  stripUrlQueryAndFragment,
} from '@sentry/utils';
import * as domain from 'domain';

import { formatAsCode, nextLogger } from '../../utils/nextLogger';
import type { AugmentedNextApiRequest, AugmentedNextApiResponse, NextApiHandler, WrappedNextApiHandler } from './types';
import { autoEndTransactionOnResponseEnd, finishTransaction, flushQueue } from './utils/responseEnd';

/**
 * Wrap the given API route handler for tracing and error capturing. Thin wrapper around `withSentry`, which only
 * applies it if it hasn't already been applied.
 *
 * @param maybeWrappedHandler The handler exported from the user's API page route file, which may or may not already be
 * wrapped with `withSentry`
 * @param parameterizedRoute The page's route, passed in via the proxy loader
 * @returns The wrapped handler
 */
export function withSentryAPI(
  maybeWrappedHandler: NextApiHandler | WrappedNextApiHandler,
  parameterizedRoute: string,
): WrappedNextApiHandler {
  // Log a warning if the user is still manually wrapping their route in `withSentry`. Doesn't work in cases where
  // there's been an intermediate wrapper (like `withSentryAPI(someOtherWrapper(withSentry(handler)))`) but should catch
  // most cases. Only runs once per route. (Note: Such double-wrapping isn't harmful, but we'll eventually deprecate and remove `withSentry`, so
  // best to get people to stop using it.)
  if (maybeWrappedHandler.name === 'sentryWrappedHandler') {
    const [_sentryNextjs_, _autoWrapOption_, _withSentry_, _route_] = [
      '@sentry/nextjs',
      'autoInstrumentServerFunctions',
      'withSentry',
      parameterizedRoute,
    ].map(phrase => formatAsCode(phrase));

    nextLogger.info(
      `${_sentryNextjs_} is running with the ${_autoWrapOption_} flag set, which means API routes no longer need to ` +
        `be manually wrapped with ${_withSentry_}. Detected manual wrapping in ${_route_}.`,
    );
  }

  return withSentry(maybeWrappedHandler, parameterizedRoute);
}

/**
 * Legacy function for manually wrapping API route handlers, now used as the innards of `withSentryAPI`.
 *
 * @param origHandler The user's original API route handler
 * @param parameterizedRoute The route whose handler is being wrapped. Meant for internal use only.
 * @returns A wrapped version of the handler
 */
export function withSentry(origHandler: NextApiHandler, parameterizedRoute?: string): WrappedNextApiHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  return async function sentryWrappedHandler(req: AugmentedNextApiRequest, res: AugmentedNextApiResponse) {
    // We're now auto-wrapping API route handlers using `withSentryAPI` (which uses `withSentry` under the hood), but
    // users still may have their routes manually wrapped with `withSentry`. This check makes `sentryWrappedHandler`
    // idempotent so that those cases don't break anything.
    if (req.__withSentry_applied__) {
      return origHandler(req, res);
    }
    req.__withSentry_applied__ = true;

    // use a domain in order to prevent scope bleed between requests
    const local = domain.create();
    local.add(req);
    local.add(res);

    // `local.bind` causes everything to run inside a domain, just like `local.run` does, but it also lets the callback
    // return a value. In our case, all any of the codepaths return is a promise of `void`, but nextjs still counts on
    // getting that before it will finish the response.
    const boundHandler = local.bind(async () => {
      let transaction;
      const currentScope = getCurrentHub().getScope();

      if (currentScope) {
        currentScope.setSDKProcessingMetadata({ request: req });

        if (hasTracingEnabled()) {
          // If there is a trace header set, extract the data from it (parentSpanId, traceId, and sampling decision)
          let traceparentData;
          if (req.headers && isString(req.headers['sentry-trace'])) {
            traceparentData = extractTraceparentData(req.headers['sentry-trace']);
            __DEBUG_BUILD__ && logger.log(`[Tracing] Continuing trace ${traceparentData?.traceId}.`);
          }

          const baggageHeader = req.headers && req.headers.baggage;
          const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(baggageHeader);

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

          autoEndTransactionOnResponseEnd(transaction, res);
        }
      }

      try {
        const handlerResult = await origHandler(req, res);

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

        if (currentScope) {
          currentScope.addEventProcessor(event => {
            addExceptionMechanism(event, {
              type: 'instrument',
              handled: true,
              data: {
                wrapped_handler: origHandler.name,
                function: 'withSentry',
              },
            });
            return event;
          });

          captureException(objectifiedErr);
        }

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
        await finishTransaction(transaction, res);
        await flushQueue();

        // We rethrow here so that nextjs can do with the error whatever it would normally do. (Sometimes "whatever it
        // would normally do" is to allow the error to bubble up to the global handlers - another reason we need to mark
        // the error as already having been captured.)
        throw objectifiedErr;
      }
    });

    // Since API route handlers are all async, nextjs always awaits the return value (meaning it's fine for us to return
    // a promise here rather than a real result, and it saves us the overhead of an `await` call.)
    return boundHandler();
  };
}
