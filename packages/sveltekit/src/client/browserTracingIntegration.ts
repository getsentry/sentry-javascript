import { navigating, page } from '$app/stores';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  getActiveSpan,
  startInactiveSpan,
} from '@sentry/core';
import {
  BrowserTracing as OriginalBrowserTracing,
  WINDOW,
  browserTracingIntegration as originalBrowserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from '@sentry/svelte';
import type { Client, Integration, Span } from '@sentry/types';
import { svelteKitRoutingInstrumentation } from './router';

/**
 * A custom BrowserTracing integration for Sveltekit.
 *
 * @deprecated use `browserTracingIntegration()` instead.
 */
export class BrowserTracing extends OriginalBrowserTracing {
  public constructor(options?: ConstructorParameters<typeof OriginalBrowserTracing>[0]) {
    super({
      // eslint-disable-next-line deprecation/deprecation
      routingInstrumentation: svelteKitRoutingInstrumentation,
      ...options,
    });
  }
}

/**
 * A custom `BrowserTracing` integration for SvelteKit.
 *
 * @param options
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

  startBrowserTracingPageLoadSpan(client, {
    name: initialPath,
    op: 'pageload',
    origin: 'auto.pageload.sveltekit',
    description: initialPath,
    tags: {
      'routing.instrumentation': '@sentry/sveltekit',
    },
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
    },
  });

  const pageloadSpan = getActiveSpan();

  page.subscribe(page => {
    if (!page) {
      return;
    }

    const routeId = page.route && page.route.id;

    if (pageloadSpan && routeId) {
      pageloadSpan.updateName(routeId);
      pageloadSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
    }
  });
}

/**
 * Use the `navigating` store to start a transaction on navigations.
 */
function _instrumentNavigations(client: Client): void {
  let routingSpan: Span | undefined = undefined;
  let activeSpan: Span | undefined;

  navigating.subscribe(navigation => {
    if (!navigation) {
      // `navigating` emits a 'null' value when the navigation is completed.
      // So in this case, we can finish the routing span. If the transaction was an IdleTransaction,
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

    activeSpan = getActiveSpan();

    if (!activeSpan) {
      startBrowserTracingNavigationSpan(client, {
        name: parameterizedRouteDestination || rawRouteDestination || 'unknown',
        op: 'navigation',
        origin: 'auto.navigation.sveltekit',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: parameterizedRouteDestination ? 'route' : 'url',
        },
        tags: {
          'routing.instrumentation': '@sentry/sveltekit',
        },
      });
      activeSpan = getActiveSpan();
    }

    if (activeSpan) {
      if (routingSpan) {
        // If a routing span is still open from a previous navigation, we finish it.
        routingSpan.end();
      }
      routingSpan = startInactiveSpan({
        op: 'ui.sveltekit.routing',
        name: 'SvelteKit Route Change',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.sveltekit',
        },
      });
      activeSpan.setAttribute('sentry.sveltekit.navigation.from', parameterizedRouteOrigin || undefined);
    }
  });
}
