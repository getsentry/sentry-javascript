import { navigating, page } from '$app/stores';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import {
  WINDOW,
  browserTracingIntegration as originalBrowserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
  startInactiveSpan,
} from '@sentry/svelte';
import type { Client, Integration, Span } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';

/**
 * A custom `BrowserTracing` integration for SvelteKit.
 */
export function browserTracingIntegration(
  options: Parameters<typeof originalBrowserTracingIntegration>[0] = {},
): Integration {
  const integration = {
    ...originalBrowserTracingIntegration({
      ...options,
      instrumentNavigation: false,
      instrumentPageLoad: false,
    }),
  };

  return {
    ...integration,
    afterAllSetup: client => {
      integration.afterAllSetup(client);

      if (options.instrumentPageLoad !== false) {
        _instrumentPageload(client);
      }

      if (options.instrumentNavigation !== false) {
        _instrumentNavigations(client);
      }
    },
  };
}

function _instrumentPageload(client: Client): void {
  const initialPath = WINDOW && WINDOW.location && WINDOW.location.pathname;

  const pageloadSpan = startBrowserTracingPageLoadSpan(client, {
    name: initialPath,
    op: 'pageload',
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.sveltekit',
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
    },
  });
  if (!pageloadSpan) {
    return;
  }

  page.subscribe(page => {
    if (!page) {
      return;
    }

    const routeId = page.route && page.route.id;

    if (routeId) {
      pageloadSpan.updateName(routeId);
      pageloadSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
    }
  });
}

/**
 * Use the `navigating` store to start a transaction on navigations.
 */
function _instrumentNavigations(client: Client): void {
  let routingSpan: Span | undefined;

  navigating.subscribe(navigation => {
    if (!navigation) {
      // `navigating` emits a 'null' value when the navigation is completed.
      // So in this case, we can finish the routing span. If the span was an idle span,
      // it will finish automatically and if it was user-created users also need to finish it.
      if (routingSpan) {
        routingSpan.end();
        routingSpan = undefined;
      }
      return;
    }

    const from = navigation.from;
    const to = navigation.to;

    // for the origin we can fall back to window.location.pathname because in this emission, it still is set to the origin path
    const rawRouteOrigin = (from && from.url.pathname) || (WINDOW && WINDOW.location && WINDOW.location.pathname);

    const rawRouteDestination = to && to.url.pathname;

    // We don't want to create transactions for navigations of same origin and destination.
    // We need to look at the raw URL here because parameterized routes can still differ in their raw parameters.
    if (rawRouteOrigin === rawRouteDestination) {
      return;
    }

    const parameterizedRouteOrigin = from && from.route.id;
    const parameterizedRouteDestination = to && to.route.id;

    if (routingSpan) {
      // If a routing span is still open from a previous navigation, we finish it.
      // This is important for e.g. redirects when a new navigation root span finishes
      // the first root span. If we don't `.end()` the previous span, it will get
      // status 'cancelled' which isn't entirely correct.
      routingSpan.end();
    }

    const navigationInfo = dropUndefinedKeys({
      //  `navigation.type` denotes the origin of the navigation. e.g.:
      //   - link (clicking on a link)
      //   - goto (programmatic via goto() or redirect())
      //   - popstate (back/forward navigation)
      'sentry.sveltekit.navigation.type': navigation.type,
      'sentry.sveltekit.navigation.from': parameterizedRouteOrigin || undefined,
      'sentry.sveltekit.navigation.to': parameterizedRouteDestination || undefined,
    });

    startBrowserTracingNavigationSpan(client, {
      name: parameterizedRouteDestination || rawRouteDestination || 'unknown',
      op: 'navigation',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.sveltekit',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: parameterizedRouteDestination ? 'route' : 'url',
        ...navigationInfo,
      },
    });

    routingSpan = startInactiveSpan({
      op: 'ui.sveltekit.routing',
      name: 'SvelteKit Route Change',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.sveltekit',
        ...navigationInfo,
      },
      onlyIfParent: true,
    });
  });
}
