import {
  captureException,
  continueTrace,
  debug,
  getActiveSpan,
  httpRequestToRequestData,
  isString,
  objectify,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setHttpStatus,
  startSpanManual,
  withIsolationScope,
} from '@sentry/core';
import type { NextApiRequest } from 'next';
import type { AugmentedNextApiResponse, NextApiHandler } from '../types';
import { flushSafelyWithTimeout, waitUntil } from '../utils/responseEnd';
import { dropNextjsRootContext, escapeNextjsTracing } from '../utils/tracingUtils';

export type AugmentedNextApiRequest = NextApiRequest & {
  __withSentry_applied__?: boolean;
};

/**
 * Wrap the given API route handler with error nad performance monitoring.
 *
 * @param apiHandler The handler exported from the user's API page route file, which may or may not already be
 * wrapped with `withSentry`
 * @param parameterizedRoute The page's parameterized route.
 * @returns The wrapped handler which will always return a Promise.
 */
export function wrapApiHandlerWithSentry(apiHandler: NextApiHandler, parameterizedRoute: string): NextApiHandler {
  return new Proxy(apiHandler, {
    apply: (
      wrappingTarget,
      thisArg,
      args: [AugmentedNextApiRequest | undefined, AugmentedNextApiResponse | undefined],
    ) => {
      dropNextjsRootContext();
      return escapeNextjsTracing(() => {
        const [req, res] = args;

        if (!req) {
          debug.log(
            `Wrapped API handler on route "${parameterizedRoute}" was not passed a request object. Will not instrument.`,
          );
          return wrappingTarget.apply(thisArg, args);
        } else if (!res) {
          debug.log(
            `Wrapped API handler on route "${parameterizedRoute}" was not passed a response object. Will not instrument.`,
          );
          return wrappingTarget.apply(thisArg, args);
        }

        // Prevent double wrapping of the same request.
        if (req.__withSentry_applied__) {
          return wrappingTarget.apply(thisArg, args);
        }
        req.__withSentry_applied__ = true;

        return withIsolationScope(isolationScope => {
          // Normally, there is an active span here (from Next.js OTEL) and we just use that as parent
          // Else, we manually continueTrace from the incoming headers
          const continueTraceIfNoActiveSpan = getActiveSpan()
            ? <T>(_opts: unknown, callback: () => T) => callback()
            : continueTrace;

          return continueTraceIfNoActiveSpan(
            {
              sentryTrace:
                req.headers && isString(req.headers['sentry-trace']) ? req.headers['sentry-trace'] : undefined,
              baggage: req.headers?.baggage,
            },
            () => {
              const reqMethod = `${(req.method || 'GET').toUpperCase()} `;
              const normalizedRequest = httpRequestToRequestData(req);

              isolationScope.setSDKProcessingMetadata({ normalizedRequest });
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
                      setHttpStatus(span, res.statusCode);
                      span.end();
                      waitUntil(flushSafelyWithTimeout());
                      return target.apply(thisArg, argArray);
                    },
                  });
                  try {
                    return await wrappingTarget.apply(thisArg, args);
                  } catch (e) {
                    // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
                    // store a seen flag on it. (Because of the one-way-on-Vercel-one-way-off-of-Vercel approach we've been forced
                    // to take, it can happen that the same thrown object gets caught in two different ways, and flagging it is a
                    // way to prevent it from actually being reported twice.)
                    const objectifiedErr = objectify(e);

                    captureException(objectifiedErr, {
                      mechanism: {
                        type: 'auto.http.nextjs.api_handler',
                        handled: false,
                        data: {
                          wrapped_handler: wrappingTarget.name,
                          function: 'withSentry',
                        },
                      },
                    });

                    setHttpStatus(span, 500);
                    span.end();

                    // we need to await the flush here to ensure that the error is captured
                    // as the runtime freezes as soon as the error is thrown below
                    await flushSafelyWithTimeout();

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
