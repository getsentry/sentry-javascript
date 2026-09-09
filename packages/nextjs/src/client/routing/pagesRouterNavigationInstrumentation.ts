import type { Client, TransactionSource } from '@sentry/core';
import {
  hasSpanStreamingEnabled,
  NAVIGATION_SPAN_NAME_FALLBACK,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  stripUrlQueryAndFragment,
} from '@sentry/core';
import { getAbsoluteUrl, startBrowserTracingNavigationSpan, WINDOW } from '@sentry/react';
import RouterImport from 'next/router';
import { SENTRY_OP, SENTRY_SEGMENT_NAME_SOURCE, URL_TEMPLATE } from '@sentry/conventions/attributes';
import { NAVIGATION } from '@sentry/conventions/op';

// next/router v10 is CJS
//
// For ESM/CJS interoperability 'reasons', depending on how this file is loaded, Router might be on the default export
const Router: typeof RouterImport = RouterImport.events
  ? RouterImport
  : (RouterImport as unknown as { default: typeof RouterImport }).default;

const globalObject = WINDOW;

/**
 * Instruments the Next.js pages router for navigation.
 * Only supported for client side routing. Works for Next >= 10.
 *
 * Leverages the SingletonRouter from the `next/router` to
 * generate pageload/navigation transactions and parameterize
 * transaction names.
 */
export function pagesRouterInstrumentNavigation(client: Client): void {
  Router.events.on('routeChangeStart', (navigationTarget: string) => {
    const strippedNavigationTarget = stripUrlQueryAndFragment(navigationTarget);
    const matchedRoute = getNextRouteFromPathname(strippedNavigationTarget);

    let newLocation: string;
    let spanSource: TransactionSource;

    if (matchedRoute) {
      newLocation = matchedRoute;
      spanSource = 'route';
    } else {
      newLocation = strippedNavigationTarget;
      spanSource = 'url';
    }

    startBrowserTracingNavigationSpan(
      client,
      {
        // With span streaming, span names have to be low cardinality, so we can't fall back to the URL.
        name: spanSource === 'route' || !hasSpanStreamingEnabled(client) ? newLocation : NAVIGATION_SPAN_NAME_FALLBACK,
        attributes: {
          [SENTRY_OP]: NAVIGATION,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.nextjs.pages_router_instrumentation',
          [SENTRY_SEGMENT_NAME_SOURCE]: spanSource,
          ...(spanSource === 'route' && { [URL_TEMPLATE]: newLocation }),
        },
      },
      { url: getAbsoluteUrl(navigationTarget) },
    );
  });
}

function getNextRouteFromPathname(pathname: string): string | undefined {
  const pageRoutes = globalObject.__BUILD_MANIFEST?.sortedPages;

  // Page route should in 99.999% of the cases be defined by now but just to be sure we make a check here
  if (!pageRoutes) {
    return;
  }

  return pageRoutes.find(route => {
    const routeRegExp = convertNextRouteToRegExp(route);
    return pathname.match(routeRegExp);
  });
}

/**
 * Converts a Next.js style route to a regular expression that matches on pathnames (no query params or URL fragments).
 *
 * In general this involves replacing any instances of square brackets in a route with a wildcard:
 * e.g. "/users/[id]/info" becomes /\/users\/([^/]+?)\/info/
 *
 * Some additional edgecases need to be considered:
 * - All routes have an optional slash at the end, meaning users can navigate to "/users/[id]/info" or
 *   "/users/[id]/info/" - both will be resolved to "/users/[id]/info".
 * - Non-optional "catchall"s at the end of a route must be considered when matching (e.g. "/users/[...params]").
 * - Optional "catchall"s at the end of a route must be considered when matching (e.g. "/users/[[...params]]").
 *
 * @param route A Next.js style route as it is found in `global.__BUILD_MANIFEST.sortedPages`
 */
function convertNextRouteToRegExp(route: string): RegExp {
  // We can assume a route is at least "/".
  const routeParts = route.split('/');

  let optionalCatchallWildcardRegex = '';
  if (routeParts[routeParts.length - 1]?.match(/^\[\[\.\.\..+\]\]$/)) {
    // If last route part has pattern "[[...xyz]]" we pop the latest route part to get rid of the required trailing
    // slash that would come before it if we didn't pop it.
    routeParts.pop();
    optionalCatchallWildcardRegex = '(?:/(.+?))?';
  }

  const rejoinedRouteParts = routeParts
    .map(
      routePart =>
        routePart
          .replace(/^\[\.\.\..+\]$/, '(.+?)') // Replace catch all wildcard with regex wildcard
          .replace(/^\[.*\]$/, '([^/]+?)'), // Replace route wildcards with lazy regex wildcards
    )
    .join('/');

  // oxlint-disable-next-line sdk/no-regexp-constructor -- routeParts are from the build manifest, so no raw user input
  return new RegExp(
    `^${rejoinedRouteParts}${optionalCatchallWildcardRegex}(?:/)?$`, // optional slash at the end
  );
}
