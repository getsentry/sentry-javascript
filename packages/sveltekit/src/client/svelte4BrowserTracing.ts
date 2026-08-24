import type { Client, Span } from '@sentry/core';
import { hasSpanStreamingEnabled, PAGELOAD_SPAN_NAME_FALLBACK, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import {
  getCurrentScope,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
  startInactiveSpan,
  WINDOW,
} from '@sentry/svelte';
import { SENTRY_SEGMENT_NAME_SOURCE, SENTRY_OP, URL_TEMPLATE } from '@sentry/conventions/attributes';
import type { Navigation, Page } from '@sveltejs/kit';
// eslint-disable-next-line typescript/no-deprecated
import { navigating, page } from '$app/stores';
import type { Readable } from 'svelte/store';

/**
 * SvelteKit 2 / Svelte 4 browser tracing (`$app/stores`). Selected at build time, so it's only
 * bundled on Kit 2 (where `$app/state` may not exist).
 * @internal
 */
export function instrumentSvelteKitTracing(
  client: Client,
  options: { instrumentPageLoad?: boolean; instrumentNavigation?: boolean },
): void {
  if (options.instrumentPageLoad !== false) {
    // eslint-disable-next-line typescript/no-deprecated
    _instrumentPageload(client, page);
  }

  if (options.instrumentNavigation !== false) {
    // eslint-disable-next-line typescript/no-deprecated
    _instrumentNavigations(client, navigating);
  }
}

function _instrumentPageload(client: Client, pageStore: Readable<Page>): void {
  const initialPath = WINDOW.location?.pathname;

  const pageloadSpan = startBrowserTracingPageLoadSpan(client, {
    // With span streaming, span names have to be low cardinality. The route id is only available
    // asynchronously, which updates the span name then.
    name: hasSpanStreamingEnabled(client) ? PAGELOAD_SPAN_NAME_FALLBACK : initialPath,
    op: 'pageload',
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.sveltekit',
      [SENTRY_SEGMENT_NAME_SOURCE]: 'url',
    },
  });
  if (!pageloadSpan) {
    return;
  }

  pageStore.subscribe(pageState => {
    if (!pageState) {
      return;
    }

    const routeId = pageState.route?.id;

    if (routeId) {
      pageloadSpan.updateName(routeId);
      pageloadSpan.setAttributes({ [SENTRY_SEGMENT_NAME_SOURCE]: 'route', [URL_TEMPLATE]: routeId });
      getCurrentScope().setTransactionName(routeId);
    }
  });
}

/**
 * Use the `navigating` store to start a transaction on navigations.
 */
function _instrumentNavigations(client: Client, navigatingStore: Readable<Navigation | null>): void {
  let routingSpan: Span | undefined;

  navigatingStore.subscribe(navigation => {
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
    const rawRouteOrigin = from?.url.pathname || WINDOW.location?.pathname;

    const rawRouteDestination = to?.url.pathname;

    // We don't want to create transactions for navigations of same origin and destination.
    // We need to look at the raw URL here because parameterized routes can still differ in their raw parameters.
    if (rawRouteOrigin === rawRouteDestination) {
      return;
    }

    const parameterizedRouteOrigin = from?.route.id;
    const parameterizedRouteDestination = to?.route.id;

    if (routingSpan) {
      // If a routing span is still open from a previous navigation, we finish it.
      routingSpan.end();
    }

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
          [SENTRY_SEGMENT_NAME_SOURCE]: parameterizedRouteDestination ? 'route' : 'url',
          ...(parameterizedRouteDestination && { [URL_TEMPLATE]: parameterizedRouteDestination }),
          ...navigationInfo,
        },
      },
      { url: to?.url.href },
    );

    routingSpan = startInactiveSpan({
      name: 'SvelteKit Route Change',
      attributes: {
        // TODO(conventions): Replace `'router'` with the `router` span op constant once it is released in `@sentry/conventions`.
        [SENTRY_OP]: 'router',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.sveltekit',
        ...navigationInfo,
      },
      onlyIfParent: true,
    });
  });
}
