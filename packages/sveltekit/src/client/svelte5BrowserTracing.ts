import type { Client, Span } from '@sentry/core';
import {
  hasSpanStreamingEnabled,
  PAGELOAD_SPAN_NAME_FALLBACK,
  ROUTER_SPAN_NAME_FALLBACK,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import {
  getCurrentScope,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
  startInactiveSpan,
  WINDOW,
} from '@sentry/svelte';
import { SENTRY_OP, URL_TEMPLATE } from '@sentry/conventions/attributes';
import type { Navigation } from '@sveltejs/kit';
import { getCurrentNavigation, onNavigationChange, onPageRouteChange } from './navigationState.svelte';

/**
 * SvelteKit 3 / Svelte 5 browser tracing (`$app/state` runes). Selected at build time, so it's only
 * bundled on Kit 3.
 * @internal
 */
export function instrumentSvelteKitTracing(
  client: Client,
  options: { instrumentPageLoad?: boolean; instrumentNavigation?: boolean },
): void {
  if (options.instrumentPageLoad !== false) {
    _instrumentPageLoad(client);
  }

  if (options.instrumentNavigation !== false) {
    _instrumentNavigations(client);
  }
}

function _instrumentPageLoad(client: Client): void {
  const initialPath = WINDOW.location?.pathname;

  const pageLoadSpan = startBrowserTracingPageLoadSpan(client, {
    // With span streaming, span names have to be low cardinality. The route id is only available
    // asynchronously, which updates the span name then.
    name: hasSpanStreamingEnabled(client) ? PAGELOAD_SPAN_NAME_FALLBACK : initialPath,
    op: 'pageload',
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.sveltekit',
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
    },
  });

  if (!pageLoadSpan) {
    return;
  }

  // `page.route.id` isn't available synchronously when we set up (during `Sentry.init`), so we react
  // to it and upgrade the pageload span from `url` to the parameterized `route` once it resolves.
  onPageRouteChange(routeId => {
    if (routeId) {
      pageLoadSpan.updateName(routeId);
      pageLoadSpan.setAttributes({ [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route', [URL_TEMPLATE]: routeId });
      getCurrentScope().setTransactionName(routeId);
    }
  });
}

function _instrumentNavigations(client: Client): void {
  let routingSpan: Span | undefined;
  // Deduplicates the two triggers below (the `fetch` wrapper and the `$effect`) so a single
  // navigation starts exactly one span, regardless of which fires first.
  let activeNavigationId: string | undefined;

  function _startNavigation(navigation: Navigation): void {
    const from = navigation.from;
    const to = navigation.to;
    const rawRouteOrigin = from?.url.pathname || WINDOW.location?.pathname;
    const rawRouteDestination = to?.url.pathname;

    if (rawRouteOrigin === rawRouteDestination) {
      return;
    }

    const navigationId = to?.url.href;
    if (navigationId && navigationId === activeNavigationId) {
      return;
    }
    activeNavigationId = navigationId;

    const parameterizedRouteOrigin = from?.route.id;
    const parameterizedRouteDestination = to?.route.id;

    routingSpan?.end();

    const navigationInfo = {
      'sentry.sveltekit.navigation.type': navigation.type,
      'sentry.sveltekit.navigation.from': parameterizedRouteOrigin || undefined,
      'sentry.sveltekit.navigation.to': parameterizedRouteDestination || undefined,
    };

    startBrowserTracingNavigationSpan(
      client,
      {
        name: parameterizedRouteDestination || rawRouteDestination || 'unknown',
        op: 'navigation',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.sveltekit',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: parameterizedRouteDestination ? 'route' : 'url',
          ...(parameterizedRouteDestination && { [URL_TEMPLATE]: parameterizedRouteDestination }),
          ...navigationInfo,
        },
      },
      { url: to?.url.href },
    );

    routingSpan = startInactiveSpan({
      // With span streaming, span names have to be low cardinality, and this span carries no route
      // of its own, so it's the fallback.
      name: hasSpanStreamingEnabled(client) ? ROUTER_SPAN_NAME_FALLBACK : 'SvelteKit Route Change',
      attributes: {
        // TODO(conventions): Replace `'router'` with the `router` span op constant once it is released in `@sentry/conventions`.
        [SENTRY_OP]: 'router',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.sveltekit',
        ...navigationInfo,
      },
      onlyIfParent: true,
    });
  }

  // SvelteKit fires its data request (e.g. `__data.json`) synchronously at navigation start, before
  // a `$effect` on `navigating` runs (microtask), so the request would carry the previous trace. We
  // wrap `fetch` to read `navigating` synchronously and start the nav span before the request goes.
  const originalFetch = WINDOW.fetch?.bind(WINDOW);
  if (originalFetch) {
    WINDOW.fetch = (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> => {
      const navigation = getCurrentNavigation();
      if (navigation) {
        _startNavigation(navigation);
      }
      return originalFetch(...args);
    };
  }

  onNavigationChange(navigation => {
    if (!navigation) {
      routingSpan?.end();
      routingSpan = undefined;
      activeNavigationId = undefined;
      return;
    }

    // Fallback for navigations that don't issue an outgoing request (the `fetch` wrapper never fires).
    _startNavigation(navigation);
  });
}
