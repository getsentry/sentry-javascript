import type { Client, Span } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import {
  getCurrentScope,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
  startInactiveSpan,
  WINDOW,
} from '@sentry/svelte';
import { URL_TEMPLATE } from '@sentry/conventions/attributes';
import { page } from '$app/state';
import { onNavigationChange } from './navigationState.svelte';

/** @internal */
export function instrumentSvelteKit3Tracing(
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
  const routeId = page.route.id;
  const initialPath = WINDOW.location?.pathname;

  const pageLoadSpan = startBrowserTracingPageLoadSpan(client, {
    name: routeId || initialPath,
    op: 'pageload',
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.sveltekit',
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: routeId ? 'route' : 'url',
      ...(routeId && { [URL_TEMPLATE]: routeId }),
    },
  });

  if (routeId) {
    getCurrentScope().setTransactionName(routeId);
  }

  if (!pageLoadSpan) {
    return;
  }
}

function _instrumentNavigations(client: Client): void {
  let routingSpan: Span | undefined;

  onNavigationChange(navigation => {
    if (!navigation) {
      routingSpan?.end();
      routingSpan = undefined;
      return;
    }

    const from = navigation.from;
    const to = navigation.to;
    const rawRouteOrigin = from?.url.pathname || WINDOW.location?.pathname;
    const rawRouteDestination = to?.url.pathname;

    if (rawRouteOrigin === rawRouteDestination) {
      return;
    }

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
