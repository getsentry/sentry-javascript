import {
  captureException,
  flushIfServerless,
  getActiveSpan,
  getIsolationScope,
  handleCallbackErrors,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
} from '@sentry/core';
import { isAlreadyCaptured, isNotFoundResponse, isRedirectResponse, safeFlushServerless } from './responseUtils';
import type { ServerComponentContext } from './types';

/**
 * Wraps a server component with Sentry error instrumentation.
 *
 * @experimental This API is experimental and may change in minor releases.
 * React Router RSC support requires React Router v7.9.0+ with `unstable_reactRouterRSC()`.
 *
 * @param serverComponent - The server component function to wrap
 * @param context - Context about the component for error reporting
 *
 * @example
 * ```ts
 * import { wrapServerComponent } from "@sentry/react-router";
 *
 * async function _UserPage({ params }: Route.ComponentProps) {
 *   const user = await getUser(params.id);
 *   return <UserProfile user={user} />;
 * }
 *
 * export const ServerComponent = wrapServerComponent(_UserPage, {
 *   componentRoute: "/users/:id",
 *   componentType: "Page",
 * });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapServerComponent<T extends (...args: any[]) => any>(
  serverComponent: T,
  context: ServerComponentContext,
): T {
  const { componentRoute, componentType } = context;

  return new Proxy(serverComponent, {
    apply: (originalFunction, thisArg, args) => {
      const isolationScope = getIsolationScope();

      const transactionName = `${componentType} Server Component (${componentRoute})`;
      isolationScope.setTransactionName(transactionName);

      return handleCallbackErrors(
        () => originalFunction.apply(thisArg, args),
        error => {
          const span = getActiveSpan();
          let shouldCapture = true;

          if (isRedirectResponse(error)) {
            shouldCapture = false;
            if (span) {
              span.setStatus({ code: SPAN_STATUS_OK });
            }
          }
          else if (isNotFoundResponse(error)) {
            shouldCapture = false;
            if (span) {
              span.setStatus({ code: SPAN_STATUS_ERROR, message: 'not_found' });
            }
          }
          else {
            if (span) {
              span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            }
          }

          if (shouldCapture && !isAlreadyCaptured(error)) {
            captureException(error, {
              mechanism: {
                type: 'instrument',
                handled: false,
                data: {
                  function: 'ServerComponent',
                  component_route: componentRoute,
                  component_type: componentType,
                },
              },
            });
          }
        },
        () => {
          safeFlushServerless(flushIfServerless);
        },
      );
    },
  });
}

const VALID_COMPONENT_TYPES = new Set(['Page', 'Layout', 'Loading', 'Error', 'Template', 'Not-found', 'Unknown']);

/**
 * Type guard to check if a value is a valid ServerComponentContext.
 */
export function isServerComponentContext(value: unknown): value is ServerComponentContext {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.componentRoute === 'string' &&
    obj.componentRoute.length > 0 &&
    typeof obj.componentType === 'string' &&
    VALID_COMPONENT_TYPES.has(obj.componentType)
  );
}
