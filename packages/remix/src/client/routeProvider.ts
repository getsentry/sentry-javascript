import type { RouteProvider } from '@sentry/core/browser';
import { createUrlRouteProvider } from '@sentry/core/browser';
import { maybeParameterizeRemixRoute } from './remixRouteParameterization';

/**
 * A route provider backed by the route manifest the Vite plugin injects at build time.
 *
 * The manifest is on the global object before `Sentry.init` runs, so this needs no router and no
 * tracing integration: registering it is what lets anything else in the SDK name a route.
 */
export function createRemixRouteProvider(): RouteProvider {
  return createUrlRouteProvider(url => maybeParameterizeRemixRoute(url.pathname));
}
