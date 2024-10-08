import {
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  captureException,
  continueTrace,
  getActiveSpan,
  getRootSpan,
  setHttpStatus,
  startSpanManual,
  withIsolationScope,
} from '@sentry/core';
import { consoleSandbox, isString, logger, objectify } from '@sentry/utils';

import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION } from '../span-attributes-with-logic-attached';
import type { AugmentedNextApiRequest, AugmentedNextApiResponse, NextApiHandler } from '../types';
import { flushSafelyWithTimeout } from '../utils/responseEnd';
import { escapeNextjsTracing } from '../utils/tracingUtils';
import { vercelWaitUntil } from '../utils/vercelWaitUntil';

/**
 * Wrap the given API route handler for tracing and error capturing. Thin wrapper around `withSentry`, which only
 * applies it if it hasn't already been applied.
 *
 * @param apiHandler The handler exported from the user's API page route file, which may or may not already be
 * wrapped with `withSentry`
 * @param parameterizedRoute The page's parameterized route.
 * @returns The wrapped handler
 */
export function wrapApiHandlerWithSentry(apiHandler: NextApiHandler, parameterizedRoute: string): NextApiHandler {
  // Since the API route handler spans emitted by Next.js are super buggy with completely wrong timestamps
  // (fix pending at the time of writing this: https://github.com/vercel/next.js/pull/70908) we want to intentionally
  // drop them. In the future, when Next.js' OTEL instrumentation is in a high-quality place we can potentially think
  // about keeping them.
  const nextJsOwnedSpan = getActiveSpan();
  if (nextJsOwnedSpan) {
    getRootSpan(nextJsOwnedSpan)?.setAttribute(TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION, true);
  }

  return new Proxy(apiHandler, {
    apply: (
      wrappingTarget,
      thisArg,
      args: [AugmentedNextApiRequest | undefined, AugmentedNextApiResponse | undefined],
    ) => {
      return escapeNextjsTracing(() => {
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

        return withIsolationScope(isolationScope => {
          return continueTrace(
            {
              // TODO(v8): Make it so that continue trace will allow null as sentryTrace value and remove this fallback here
              sentryTrace:
                req.headers && isString(req.headers['sentry-trace']) ? req.headers['sentry-trace'] : undefined,
              baggage: req.headers?.baggage,
            },
            () => {
              const reqMethod = `${(req.method || 'GET').toUpperCase()} `;

              isolationScope.setSDKProcessingMetadata({ request: req });
              isolationScope.setTransactionName(`${reqMethod}${parameterizedRoute}`);

              return startSpanManual(
                {
                  name: `${reqMethod}${parameterizedRoute}`,
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
                      if (span.isRecording()) {
                        setHttpStatus(span, res.statusCode);
                        span.end();
                      }
                      vercelWaitUntil(flushSafelyWithTimeout());
                      target.apply(thisArg, argArray);
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

                    if (span.isRecording()) {
                      setHttpStatus(span, res.statusCode);
                      span.end();
                    }

                    vercelWaitUntil(flushSafelyWithTimeout());

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
      });
    },
  });
}
