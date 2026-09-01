import type { RouteProvider } from '@sentry/core';
import { createUrlRouteProvider } from '@sentry/core';
import { maybeParameterizeRoute, stripBasePath, stripTrailingSlash } from './parameterization';
import { getNextRouteFromPathname } from './pagesRouterRoutingInstrumentation';

/**
 * Resolves a URL against whichever router manifest the app ships.
 *
 * App Router routes are generated with `basePath` baked in, which is what `location.pathname` gives
 * us; Next strips it internally for the Pages Router, so the fallback strips it too.
 */
function resolveNextRoute(url: URL): string | undefined {
  const pathname = stripTrailingSlash(url.pathname);

  return maybeParameterizeRoute(pathname) ?? getNextRouteFromPathname(stripBasePath(pathname));
}

/**
 * A route provider backed by the route manifests Next.js injects at build time.
 *
 * Both manifests are on the global object before `Sentry.init` runs, so this needs no router and no
 * tracing integration: registering it is what lets anything else in the SDK name a route.
 */
export function createNextRouteProvider(): RouteProvider {
  return createUrlRouteProvider(resolveNextRoute);
}
