import {
  captureException,
  getActiveSpan,
  getIsolationScope,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_ERROR,
  startSpan,
} from '@sentry/core';
import { isErrorCaptured, markErrorAsCaptured } from './responseUtils';
import type { MatchRSCServerRequestArgs, MatchRSCServerRequestFn, RSCMatch } from './types';

/**
 * Wraps `unstable_matchRSCServerRequest` from react-router with Sentry error and performance instrumentation.
 *
 * @experimental This API is experimental and may change in minor releases.
 * React Router RSC support requires React Router v7.9.0+ with `unstable_reactRouterRSC()`.
 *
 * @param originalFn - The original `unstable_matchRSCServerRequest` function from react-router
 *
 * @example
 * ```ts
 * import { unstable_matchRSCServerRequest as matchRSCServerRequest } from "react-router";
 * import { wrapMatchRSCServerRequest } from "@sentry/react-router";
 *
 * const sentryMatchRSCServerRequest = wrapMatchRSCServerRequest(matchRSCServerRequest);
 * ```
 */
export function wrapMatchRSCServerRequest(originalFn: MatchRSCServerRequestFn): MatchRSCServerRequestFn {
  return async function sentryWrappedMatchRSCServerRequest(args: MatchRSCServerRequestArgs): Promise<Response> {
    const { request, generateResponse, loadServerAction, onError, ...rest } = args;

    // Set transaction name based on request URL
    const url = new URL(request.url);
    const isolationScope = getIsolationScope();
    isolationScope.setTransactionName(`RSC ${request.method} ${url.pathname}`);

    // Update root span attributes if available
    const activeSpan = getActiveSpan();
    if (activeSpan) {
      const rootSpan = getRootSpan(activeSpan);
      if (rootSpan) {
        rootSpan.setAttributes({
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.rsc',
          'rsc.request': true,
        });
      }
    }

    // Wrapped generateResponse that captures errors and creates spans for RSC rendering
    const wrappedGenerateResponse = (
      match: RSCMatch,
      options: { temporaryReferences: unknown; onError?: (error: unknown) => string | undefined },
    ): Response => {
      return startSpan(
        {
          name: 'RSC Render',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.rsc.render',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.rsc',
            'rsc.status_code': match.statusCode,
          },
        },
        span => {
          try {
            // Wrap the inner onError to capture RSC stream errors.
            // Always provide a wrappedInnerOnError so Sentry captures stream errors
            // even when the caller does not provide an onError callback.
            const originalOnError = options.onError;
            const wrappedInnerOnError = (error: unknown): string | undefined => {
              // Only capture if not already captured
              if (!isErrorCaptured(error)) {
                markErrorAsCaptured(error);
                captureException(error, {
                  mechanism: {
                    type: 'instrument',
                    handled: false,
                    data: {
                      function: 'generateResponse.onError',
                    },
                  },
                });
              }
              return originalOnError ? originalOnError(error) : undefined;
            };

            const response = generateResponse(match, {
              ...options,
              onError: wrappedInnerOnError,
            });

            return response;
          } catch (error) {
            span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            // Capture errors thrown directly in generateResponse
            if (!isErrorCaptured(error)) {
              markErrorAsCaptured(error);
              captureException(error, {
                mechanism: {
                  type: 'instrument',
                  handled: false,
                  data: {
                    function: 'generateResponse',
                  },
                },
              });
            }
            throw error;
          }
        },
      );
    };

    // Wrapped loadServerAction that traces server function loading and execution
    const wrappedLoadServerAction = loadServerAction
      ? async (actionId: string): Promise<unknown> => {
          return startSpan(
            {
              name: `Server Action: ${actionId}`,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.rsc.server_action',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.rsc.server_action',
                'rsc.action.id': actionId,
              },
            },
            async span => {
              try {
                const result = await loadServerAction(actionId);
                return result;
              } catch (error) {
                span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                if (!isErrorCaptured(error)) {
                  markErrorAsCaptured(error);
                  captureException(error, {
                    mechanism: {
                      type: 'instrument',
                      handled: false,
                      data: {
                        function: 'loadServerAction',
                        action_id: actionId,
                      },
                    },
                  });
                }
                throw error;
              }
            },
          );
        }
      : undefined;

    // Enhanced onError handler that captures RSC server errors not already captured by inner wrappers
    const wrappedOnError = (error: unknown): void => {
      // Only capture if not already captured by generateResponse or loadServerAction wrappers
      if (!isErrorCaptured(error)) {
        markErrorAsCaptured(error);
        captureException(error, {
          mechanism: {
            type: 'instrument',
            handled: false,
            data: {
              function: 'matchRSCServerRequest.onError',
            },
          },
        });
      }

      // Call original onError if provided
      if (onError) {
        onError(error);
      }
    };

    return originalFn({
      ...rest,
      request,
      generateResponse: wrappedGenerateResponse,
      loadServerAction: wrappedLoadServerAction,
      onError: wrappedOnError,
    });
  };
}
