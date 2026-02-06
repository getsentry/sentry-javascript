import {
  captureException,
  debug,
  flushIfServerless,
  getActiveSpan,
  getIsolationScope,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../common/debug-build';
import { isAlreadyCaptured, isNotFoundResponse, isRedirectResponse } from './responseUtils';
import type { ServerComponentContext } from './types';

/**
 * Wraps a server component with Sentry error instrumentation.
 *
 * @experimental This API is experimental and may change in minor releases.
 * React Router RSC support requires React Router v7.9.0+ with `unstable_reactRouterRSC()`.
 *
 * @example
 * ```ts
 * import { wrapServerComponent } from "@sentry/react-router";
 *
 * async function UserPage({ params }: Route.ComponentProps) {
 *   const user = await getUser(params.id);
 *   return <UserProfile user={user} />;
 * }
 *
 * export default wrapServerComponent(UserPage, {
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

  DEBUG_BUILD && debug.log(`[RSC] Wrapping server component: ${componentType} (${componentRoute})`);

  return new Proxy(serverComponent, {
    apply: (originalFunction, thisArg, args) => {
      const isolationScope = getIsolationScope();

      const transactionName = `${componentType} Server Component (${componentRoute})`;
      isolationScope.setTransactionName(transactionName);

      let result: ReturnType<T>;
      try {
        result = originalFunction.apply(thisArg, args);
      } catch (error) {
        handleError(error, componentRoute, componentType);
        flushIfServerless().catch(() => undefined);
        throw error;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      if (result && typeof (result as any).then === 'function') {
        // Attach handlers as side-effects. These create new promises but we intentionally
        // return the original so React sees the unmodified rejection.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        (result as any).then(
          () => {
            flushIfServerless().catch(() => undefined);
          },
          (error: unknown) => {
            handleError(error, componentRoute, componentType);
            flushIfServerless().catch(() => undefined);
          },
        );
      } else {
        flushIfServerless().catch(() => undefined);
      }

      return result;
    },
  });
}

function handleError(error: unknown, componentRoute: string, componentType: string): void {
  const span = getActiveSpan();

  if (isRedirectResponse(error)) {
    if (span) {
      span.setStatus({ code: SPAN_STATUS_OK });
    }
    return;
  }

  if (isNotFoundResponse(error)) {
    if (span) {
      span.setStatus({ code: SPAN_STATUS_ERROR, message: 'not_found' });
    }
    return;
  }

  if (span) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
  }

  if (!isAlreadyCaptured(error)) {
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
}
