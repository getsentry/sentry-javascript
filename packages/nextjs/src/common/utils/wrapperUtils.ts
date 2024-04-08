import type { IncomingMessage, ServerResponse } from 'http';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  captureException,
  continueTrace,
  startInactiveSpan,
  startSpan,
  startSpanManual,
  withActiveSpan,
} from '@sentry/core';
import type { Span } from '@sentry/types';
import { isString } from '@sentry/utils';

import { platformSupportsStreaming } from './platformSupportsStreaming';
import { autoEndSpanOnResponseEnd, flushQueue } from './responseEnd';
import { withIsolationScopeOrReuseFromRootSpan } from './withIsolationScopeOrReuseFromRootSpan';

declare module 'http' {
  interface IncomingMessage {
    _sentrySpan?: Span;
  }
}

/**
 * Grabs a span off a Next.js datafetcher request object, if it was previously put there via
 * `setSpanOnRequest`.
 *
 * @param req The Next.js datafetcher request object
 * @returns the span on the request object if there is one, or `undefined` if the request object didn't have one.
 */
export function getSpanFromRequest(req: IncomingMessage): Span | undefined {
  return req._sentrySpan;
}

function setSpanOnRequest(span: Span, req: IncomingMessage): void {
  req._sentrySpan = span;
}

/**
 * Wraps a function that potentially throws. If it does, the error is passed to `captureException` and rethrown.
 *
 * Note: This function turns the wrapped function into an asynchronous one.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withErrorInstrumentation<F extends (...args: any[]) => any>(
  origFunction: F,
): (...params: Parameters<F>) => Promise<ReturnType<F>> {
  return async function (this: unknown, ...origFunctionArguments: Parameters<F>): Promise<ReturnType<F>> {
    try {
      return await origFunction.apply(this, origFunctionArguments);
    } catch (e) {
      // TODO: Extract error logic from `withSentry` in here or create a new wrapper with said logic or something like that.
      captureException(e, { mechanism: { handled: false } });

      throw e;
    }
  };
}

/**
 * Calls a server-side data fetching function (that takes a `req` and `res` object in its context) with tracing
 * instrumentation. A transaction will be created for the incoming request (if it doesn't already exist) in addition to
 * a span for the wrapped data fetching function.
 *
 * All of the above happens in an isolated domain, meaning all thrown errors will be associated with the correct span.
 *
 * @param origDataFetcher The data fetching method to call.
 * @param origFunctionArguments The arguments to call the data fetching method with.
 * @param req The data fetching function's request object.
 * @param res The data fetching function's response object.
 * @param options Options providing details for the created transaction and span.
 * @returns what the data fetching method call returned.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withTracedServerSideDataFetcher<F extends (...args: any[]) => Promise<any> | any>(
  origDataFetcher: F,
  req: IncomingMessage,
  res: ServerResponse,
  options: {
    /** Parameterized route of the request - will be used for naming the transaction. */
    requestedRouteName: string;
    /** Name of the route the data fetcher was defined in - will be used for describing the data fetcher's span. */
    dataFetcherRouteName: string;
    /** Name of the data fetching method - will be used for describing the data fetcher's span. */
    dataFetchingMethodName: string;
  },
): (...params: Parameters<F>) => Promise<ReturnType<F>> {
  return async function (this: unknown, ...args: Parameters<F>): Promise<ReturnType<F>> {
    return withIsolationScopeOrReuseFromRootSpan(async isolationScope => {
      isolationScope.setSDKProcessingMetadata({
        request: req,
      });

      const sentryTrace =
        req.headers && isString(req.headers['sentry-trace']) ? req.headers['sentry-trace'] : undefined;
      const baggage = req.headers?.baggage;

      return continueTrace({ sentryTrace, baggage }, () => {
        const requestSpan = getOrStartRequestSpan(req, res, options.requestedRouteName);

        return withActiveSpan(requestSpan, () => {
          return startSpanManual(
            {
              op: 'function.nextjs',
              name: `${options.dataFetchingMethodName} (${options.dataFetcherRouteName})`,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs',
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
              },
            },
            async dataFetcherSpan => {
              dataFetcherSpan.setStatus({ code: SPAN_STATUS_OK });
              try {
                return await origDataFetcher.apply(this, args);
              } catch (e) {
                dataFetcherSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                requestSpan?.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                throw e;
              } finally {
                dataFetcherSpan.end();
                if (!platformSupportsStreaming()) {
                  await flushQueue();
                }
              }
            },
          );
        });
      });
    });
  };
}

function getOrStartRequestSpan(req: IncomingMessage, res: ServerResponse, name: string): Span {
  const existingSpan = getSpanFromRequest(req);
  if (existingSpan) {
    return existingSpan;
  }

  const requestSpan = startInactiveSpan({
    name,
    forceTransaction: true,
    op: 'http.server',
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs',
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
    },
  });

  requestSpan.setStatus({ code: SPAN_STATUS_OK });
  setSpanOnRequest(requestSpan, req);
  autoEndSpanOnResponseEnd(requestSpan, res);

  return requestSpan;
}

/**
 * Call a data fetcher and trace it. Only traces the function if there is an active transaction on the scope.
 *
 * We only do the following until we move transaction creation into this function: When called, the wrapped function
 * will also update the name of the active transaction with a parameterized route provided via the `options` argument.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function callDataFetcherTraced<F extends (...args: any[]) => Promise<any> | any>(
  origFunction: F,
  origFunctionArgs: Parameters<F>,
  options: {
    parameterizedRoute: string;
    dataFetchingMethodName: string;
  },
): Promise<ReturnType<F>> {
  const { parameterizedRoute, dataFetchingMethodName } = options;

  return startSpan(
    {
      op: 'function.nextjs',
      name: `${dataFetchingMethodName} (${parameterizedRoute})`,
      onlyIfParent: true,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
      },
    },
    async dataFetcherSpan => {
      dataFetcherSpan.setStatus({ code: SPAN_STATUS_OK });

      try {
        return await origFunction(...origFunctionArgs);
      } catch (e) {
        dataFetcherSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
        captureException(e, { mechanism: { handled: false } });
        throw e;
      } finally {
        dataFetcherSpan.end();
        if (!platformSupportsStreaming()) {
          await flushQueue();
        }
      }
    },
  );
}
