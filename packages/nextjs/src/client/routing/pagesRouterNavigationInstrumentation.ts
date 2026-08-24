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
import { getNextRouteFromPathname } from './pagesRouterRoutingInstrumentation';

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
