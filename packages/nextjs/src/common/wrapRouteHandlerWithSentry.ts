import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  Scope,
  captureException,
  getActiveSpan,
  getCapturedScopesOnSpan,
  getRootSpan,
  handleCallbackErrors,
  setCapturedScopesOnSpan,
  setHttpStatus,
  withIsolationScope,
  withScope,
} from '@sentry/core';

import type { RouteHandlerContext } from './types';

import { propagationContextFromHeaders, winterCGHeadersToDict } from '@sentry/utils';

import { isNotFoundNavigationError, isRedirectNavigationError } from './nextNavigationErrorUtils';
import { commonObjectToIsolationScope, commonObjectToPropagationContext } from './utils/tracingUtils';

/**
 * Wraps a Next.js App Router Route handler with Sentry error and performance instrumentation.
 *
 * NOTICE: This wrapper is for App Router API routes. If you are looking to wrap Pages Router API routes use `wrapApiHandlerWithSentry` instead.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapRouteHandlerWithSentry<F extends (...args: any[]) => any>(
  routeHandler: F,
  context: RouteHandlerContext,
): (...args: Parameters<F>) => ReturnType<F> extends Promise<unknown> ? ReturnType<F> : Promise<ReturnType<F>> {
  const { method, parameterizedRoute, headers } = context;

  return new Proxy(routeHandler, {
    apply: async (originalFunction, thisArg, args) => {
      const isolationScope = commonObjectToIsolationScope(headers);

      const completeHeadersDict: Record<string, string> = headers ? winterCGHeadersToDict(headers) : {};

      isolationScope.setSDKProcessingMetadata({
        request: {
          url: parameterizedRoute,
          method,
          headers: completeHeadersDict,
        },
      });

      const incomingPropagationContext = propagationContextFromHeaders(
        completeHeadersDict['sentry-trace'],
        completeHeadersDict['baggage'],
      );

      const propagationContext = commonObjectToPropagationContext(headers, incomingPropagationContext);

      const activeSpan = getActiveSpan();
      const rootSpan = activeSpan ? getRootSpan(activeSpan) : undefined;
      if (rootSpan) {
        const { scope } = getCapturedScopesOnSpan(rootSpan);
        setCapturedScopesOnSpan(rootSpan, scope ?? new Scope(), isolationScope);

        if (process.env.NEXT_RUNTIME === 'edge') {
          rootSpan.updateName(`${method} ${parameterizedRoute}`);
          rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
          rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'http.server');
        }
      }

      return withIsolationScope(isolationScope, () => {
        return withScope(async scope => {
          scope.setTransactionName(`${method} ${parameterizedRoute}`);
          scope.setPropagationContext(propagationContext);

          const response: Response = await handleCallbackErrors(
            () => originalFunction.apply(thisArg, args),
            error => {
              // Next.js throws errors when calling `redirect()`. We don't wanna report these.
              if (isRedirectNavigationError(error)) {
                // Don't do anything
              } else if (isNotFoundNavigationError(error)) {
                if (activeSpan) {
                  setHttpStatus(activeSpan, 404);
                }
                if (rootSpan) {
                  setHttpStatus(rootSpan, 404);
                }
              } else {
                captureException(error, {
                  mechanism: {
                    handled: false,
                  },
                });
              }
            },
          );

          try {
            if (response.status) {
              if (activeSpan) {
                setHttpStatus(activeSpan, response.status);
              }
              if (rootSpan) {
                setHttpStatus(rootSpan, response.status);
              }
            }
          } catch {
            // best effort - response may be undefined?
          }

          return response;
        });
      });
    },
  });
}
