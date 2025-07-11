import { debug, getActiveSpan, getRootSpan, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import type { H3Event } from 'h3';

/**
 * Update the root span (transaction) name for routes with parameters based on the matched route.
 */
export function updateRouteBeforeResponse(event: H3Event): void {
  if (!event.context.matchedRoute) {
    return;
  }

  const matchedRoutePath = event.context.matchedRoute.path;

  // If the matched route path is defined and differs from the event's path, it indicates a parametrized route
  // Example: Matched route is "/users/:id" and the event's path is "/users/123",
  if (matchedRoutePath && matchedRoutePath !== event._path) {
    if (matchedRoutePath === '/**') {
      // If page is server-side rendered, the whole path gets transformed to `/**` (Example : `/users/123` becomes `/**` instead of `/users/:id`).
      return; // Skip if the matched route is a catch-all route (handled in `route-detector.server.ts`)
    }

    const activeSpan = getActiveSpan(); // In development mode, getActiveSpan() is always undefined
    if (!activeSpan) {
      return;
    }

    const rootSpan = getRootSpan(activeSpan);
    if (!rootSpan) {
      return;
    }

    rootSpan.setAttributes({
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
      'http.route': matchedRoutePath,
    });

    const params = event.context?.params;

    if (params && typeof params === 'object') {
      Object.entries(params).forEach(([key, value]) => {
        // Based on this convention: https://getsentry.github.io/sentry-conventions/generated/attributes/url.html#urlpathparameterkey
        rootSpan.setAttributes({
          [`url.path.parameter.${key}`]: String(value),
          [`params.${key}`]: String(value),
        });
      });
    }

    debug.log(`Updated transaction name for parametrized route: ${matchedRoutePath}`);
  }
}
