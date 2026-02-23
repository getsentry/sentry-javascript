import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import {
  captureException,
  debug,
  flushIfServerless,
  getActiveSpan,
  getCurrentScope,
  getIsolationScope,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  updateSpanName,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../common/debug-build';
import { isNotFoundResponse, isRedirectResponse } from './responseUtils';
import type { ServerComponentContext } from './types';

/**
 * Wraps a server component with Sentry error instrumentation.
 *
 * @experimental
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
      // No span — runs within the HTTP request span
      const isolationScope = getIsolationScope();

      const transactionName = `${componentType} Server Component (${componentRoute})`;
      isolationScope.setTransactionName(transactionName);

      // In RSC mode, wrapSentryHandleRequest is never called (React Router bypasses entry.server.tsx),
      // so we parameterize the HTTP span here from the component's route context.
      const activeSpan = getActiveSpan();
      const rootSpan = activeSpan ? getRootSpan(activeSpan) : undefined;
      if (rootSpan && componentRoute) {
        const routeName = componentRoute.startsWith('/') ? componentRoute : `/${componentRoute}`;
        // Server components are only rendered during GET requests (page loads).
        // Server functions (POST) go through wrapServerFunction instead.
        const httpTransactionName = `GET ${routeName}`;
        updateSpanName(rootSpan, httpTransactionName);
        getCurrentScope().setTransactionName(httpTransactionName);
        rootSpan.setAttributes({
          [ATTR_HTTP_ROUTE]: routeName,
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.rsc',
        });
      }

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
        // Side-effect handlers — return the original thenable so React sees the unmodified rejection
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

  captureException(error, {
    mechanism: {
      type: 'react_router.rsc',
      handled: false,
      data: {
        function: 'ServerComponent',
        component_route: componentRoute,
        component_type: componentType,
      },
    },
  });
}
