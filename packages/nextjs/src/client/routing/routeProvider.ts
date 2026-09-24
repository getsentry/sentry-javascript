import { defineIntegration } from '@sentry/core';
import type { RouteProvider } from '@sentry/react';
import { createUrlRouteProvider, setRouteProvider } from '@sentry/react';
import { maybeParameterizeRoute, stripBasePath, stripTrailingSlash } from './parameterization';
import { getNextRouteFromPathname } from './pagesRouterRoutingInstrumentation';

/**
 * Resolves a URL against whichever router manifest the app ships.
 *
 * App Router routes are generated with `basePath` baked in, which is what `location.pathname` gives
 * us; Next strips it internally for the Pages Router, so the fallback strips it too.
 */
function resolveNextRoute(url: { pathname: string }): string | undefined {
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

/**
 * Registers the Next.js route provider.
 *
 * An integration rather than part of `browserTracingIntegration` so route parameterization does not depend
 * on tracing: the route manifests are injected at build time, so anything that needs a route name (bfcache
 * metrics, web vitals) can resolve one even with tracing disabled. Registered in `setup` because the pageload
 * span is named in `browserTracingIntegration`'s `afterAllSetup`.
 */
export const nextjsRouteProviderIntegration = defineIntegration(() => ({
  name: 'NextjsRouteProvider',
  setup(client) {
    setRouteProvider(createNextRouteProvider(), client);
  },
}));
