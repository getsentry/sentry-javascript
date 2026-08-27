import type { RequestEventData } from '@sentry/core';
import {
  captureException,
  getActiveSpan,
  getCapturedScopesOnSpan,
  getIsolationScope,
  getRootSpan,
  handleCallbackErrors,
  propagationContextFromHeaders,
  Scope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  setCapturedScopesOnSpan,
  setHttpStatus,
  SPAN_STATUS_ERROR,
  winterCGHeadersToDict,
  withIsolationScope,
  withScope,
} from '@sentry/core';
import {
  isNotFoundNavigationError,
  isPrerenderControlFlowError,
  isRedirectNavigationError,
} from './nextNavigationErrorUtils';
import type { RouteHandlerContext } from './types';
import { flushSafelyWithTimeout, waitUntil } from './utils/responseEnd';
import { commonObjectToIsolationScope } from './utils/tracingUtils';
import { SENTRY_SEGMENT_NAME_SOURCE, HTTP_ROUTE } from '@sentry/conventions/attributes';

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
      const activeSpan = getActiveSpan();
      const rootSpan = activeSpan ? getRootSpan(activeSpan) : undefined;

      let edgeRuntimeIsolationScopeOverride: Scope | undefined;
      if (rootSpan && process.env.NEXT_RUNTIME === 'edge') {
        const isolationScope = commonObjectToIsolationScope(headers);
        const { scope } = getCapturedScopesOnSpan(rootSpan);
        setCapturedScopesOnSpan(rootSpan, scope ?? new Scope(), isolationScope);

        edgeRuntimeIsolationScopeOverride = isolationScope;

        rootSpan.updateName(`${method} ${parameterizedRoute}`);
        rootSpan.setAttributes({
          [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
          [HTTP_ROUTE]: parameterizedRoute,
        });
      }

      return withIsolationScope(
        process.env.NEXT_RUNTIME === 'edge' ? edgeRuntimeIsolationScopeOverride : getIsolationScope(),
        () => {
          return withScope(async scope => {
            scope.setTransactionName(`${method} ${parameterizedRoute}`);

            if (process.env.NEXT_RUNTIME === 'edge') {
              const completeHeadersDict: Record<string, string> = headers ? winterCGHeadersToDict(headers) : {};
              const incomingPropagationContext = propagationContextFromHeaders(
                completeHeadersDict['sentry-trace'],
                completeHeadersDict['baggage'],
              );
              scope.setPropagationContext(incomingPropagationContext);
              scope.setSDKProcessingMetadata({
                normalizedRequest: {
                  method,
                  headers: completeHeadersDict,
                } satisfies RequestEventData,
              });
            }

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
                } else if (isPrerenderControlFlowError(error)) {
                  // Next.js aborts prerenders by rejecting the promises it handed out. React discards those
                  // rejections, so they are expected, do not affect the response, and must not be reported.
                } else {
                  const errorStatus = { code: SPAN_STATUS_ERROR, message: 'internal_error' } as const;
                  activeSpan?.setStatus(errorStatus);
                  rootSpan?.setStatus(errorStatus);
                  captureException(error, {
                    mechanism: {
                      handled: false,
                      type: 'auto.function.nextjs.route_handler',
                    },
                  });
                }
              },
              () => {
                waitUntil(flushSafelyWithTimeout());
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
        },
      );
    },
  });
}
