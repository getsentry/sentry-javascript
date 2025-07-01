import { getActiveSpan, getCurrentScope, getRootSpan, logger, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import type { H3Event } from 'h3';

/**
 * Update the root span (transaction) name for routes with parameters based on the matched route.
 */
export function updateRouteBeforeResponse(event: H3Event): void {
  if (event.context.matchedRoute) {
    const matchedRoute = event.context.matchedRoute;
    const matchedRoutePath = matchedRoute.path;
    const params = event.context?.params || null;
    const method = event._method || 'GET';

    // If the matched route path is defined and differs from the event's path, it indicates a parametrized route
    // Example: If the matched route is "/users/:id" and the event's path is "/users/123",
    if (matchedRoutePath && matchedRoutePath !== event._path) {
      const parametrizedTransactionName = `${method.toUpperCase()} ${matchedRoutePath}`;
      getCurrentScope().setTransactionName(parametrizedTransactionName);

      const activeSpan = getActiveSpan(); // In development mode, getActiveSpan() is always undefined
      if (activeSpan) {
        const rootSpan = getRootSpan(activeSpan);
        if (rootSpan) {
          rootSpan.updateName(parametrizedTransactionName);
          rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
          rootSpan.setAttribute('http.route', matchedRoutePath);

          if (params && typeof params === 'object') {
            Object.entries(params).forEach(([key, value]) => {
              rootSpan.setAttribute(`params.${key}`, String(value));
            });
          }

          logger.log(`Updated transaction name for parametrized route: ${parametrizedTransactionName}`);
        }
      }
    }
  }
}
