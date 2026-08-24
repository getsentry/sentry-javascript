import { createCachedRouteProvider } from '@sentry/core';

// SvelteKit has no public route matcher, and `page.route.id` is not available synchronously, so the
// provider answers from route ids the instrumentation has already seen rather than by matching.
export const routeProvider = createCachedRouteProvider();

/**
 * Records the parameterized route id SvelteKit reported for a path.
 *
 * Called from both the Kit 2 and Kit 3 instrumentation, since `page.route.id` is the only place the
 * route id is available.
 */
export function recordRouteId(pathname: string | undefined, routeId: string | null | undefined): void {
  routeProvider.record(pathname, routeId);
}
