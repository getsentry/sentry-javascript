import type { Integration } from '@sentry/core';
import { createUrlRouteProvider, setRouteProvider } from '@sentry/core/browser';
import { browserTracingIntegration as originalBrowserTracingIntegration, isBotUserAgent } from '@sentry/react';
import { maybeParameterizeRoute, stripBasePath, stripTrailingSlash, withBasePath } from './routing/parameterization';
import { getNextRouteFromPathname } from './routing/pagesRouterRoutingInstrumentation';
import { nextRouterInstrumentNavigation, nextRouterInstrumentPageLoad } from './routing/nextRoutingInstrumentation';

/**
 * Resolves a URL against whichever router manifest the app ships.
 *
 * The two want the pathname differently: App Router routes are generated with `basePath` baked in,
 * while Next strips it internally for the Pages Router.
 */
function resolveNextRoute(url: URL): string | undefined {
  const pathname = stripTrailingSlash(url.pathname);

  return maybeParameterizeRoute(withBasePath(pathname)) ?? getNextRouteFromPathname(stripBasePath(pathname));
}

/**
 * A custom browser tracing integration for Next.js.
 */
export function browserTracingIntegration(
  options: Parameters<typeof originalBrowserTracingIntegration>[0] = {},
): Integration {
  const browserTracingIntegrationInstance = originalBrowserTracingIntegration({
    ...options,
    instrumentNavigation: false,
    instrumentPageLoad: false,
    onRequestSpanStart(...args) {
      const [span, { headers }] = args;

      // Next.js prefetch requests have a `next-router-prefetch` header
      if (headers?.get('next-router-prefetch')) {
        span?.setAttribute('http.request.prefetch', true);
      }

      return options.onRequestSpanStart?.(...args);
    },
  });

  const { instrumentPageLoad = true, instrumentNavigation = true } = options;

  return {
    ...browserTracingIntegrationInstance,
    setup(client) {
      // Registered here rather than in `afterAllSetup` so it is in place before the pageload span is
      // named. The build-time route manifest is already on the global object at this point, so nothing
      // has to wait for the router itself.
      setRouteProvider(createUrlRouteProvider(resolveNextRoute), client);

      browserTracingIntegrationInstance.setup?.(client);
    },
    afterAllSetup(client) {
      if (isBotUserAgent()) {
        return;
      }

      // We need to run the navigation span instrumentation before the `afterAllSetup` hook on the normal browser
      // tracing integration because we need to ensure the order of execution is as follows:
      // Instrumentation to start span on RSC fetch request runs -> Instrumentation to put tracing headers from active span on fetch runs
      // If it were the other way around, the RSC fetch request would not receive the tracing headers from the navigation transaction.
      if (instrumentNavigation) {
        nextRouterInstrumentNavigation(client);
      }

      browserTracingIntegrationInstance.afterAllSetup(client);

      if (instrumentPageLoad) {
        nextRouterInstrumentPageLoad(client);
      }
    },
  };
}
