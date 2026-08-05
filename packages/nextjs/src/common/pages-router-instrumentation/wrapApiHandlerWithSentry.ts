import {
  captureException,
  debug,
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  httpRequestToRequestData,
  objectify,
  setCapturedScopesOnSpan,
  withIsolationScope,
} from '@sentry/core';
import type { NextApiRequest } from 'next';
import { TRANSACTION_ATTR_SENTRY_ROUTE_BACKFILL } from '../span-attributes-with-logic-attached';
import type { AugmentedNextApiResponse, NextApiHandler } from '../types';
import { flushSafelyWithTimeout, waitUntil } from '../utils/responseEnd';

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
    apply: async (
      wrappingTarget,
      thisArg,
      args: [AugmentedNextApiRequest | undefined, AugmentedNextApiResponse | undefined],
    ) => {
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

      return withIsolationScope(async isolationScope => {
        const reqMethod = `${(req.method || 'GET').toUpperCase()} `;

        isolationScope.setSDKProcessingMetadata({ normalizedRequest: httpRequestToRequestData(req) });
        isolationScope.setTransactionName(`${reqMethod}${parameterizedRoute}`);

        // We no longer create the transaction ourselves: it's the Next.js root span, which captured a different
        // isolation scope than the one forked here. Bind this scope to that span so the request data and anything
        // set on the scope during the handler (tags, breadcrumbs) land on the transaction.
        const activeSpan = getActiveSpan();
        const rootSpan = activeSpan ? getRootSpan(activeSpan) : undefined;
        if (rootSpan) {
          setCapturedScopesOnSpan(rootSpan, getCurrentScope(), isolationScope);

          // The `BaseServer.handleRequest` root span for a pages-router API route carries no `http.route`, so it would
          // otherwise be named from the raw URL with a `url` source. Backfill the parameterized route so the transaction
          // gets a `route` source and a parameterized `http.route`.
          rootSpan.setAttribute(TRANSACTION_ATTR_SENTRY_ROUTE_BACKFILL, parameterizedRoute);
        }

        try {
          const result = await wrappingTarget.apply(thisArg, args);

          // Flush non-blockingly so serverless runtimes (Vercel, Cloudflare) don't freeze before the event is sent
          waitUntil(flushSafelyWithTimeout());

          return result;
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

          // we need to await the flush here to ensure that the error is captured
          // as the runtime freezes as soon as the error is thrown below
          await flushSafelyWithTimeout();

          // We rethrow here so that nextjs can do with the error whatever it would normally do. (Sometimes "whatever it
          // would normally do" is to allow the error to bubble up to the global handlers - another reason we need to mark
          // the error as already having been captured.)
          throw objectifiedErr;
        }
      });
    },
  });
}
