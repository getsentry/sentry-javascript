import {
  browserTracingIntegration as originalBrowserTracingIntegration,
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  getRouteProvider,
  resolveCurrentRoute,
  startBrowserTracingNavigationSpan,
  WINDOW,
} from '@sentry/browser';
import { SENTRY_OP, SENTRY_ORIGIN, SENTRY_SEGMENT_NAME_SOURCE, URL_TEMPLATE } from '@sentry/conventions/attributes';
import {
  type Client,
  hasSpanStreamingEnabled,
  type Integration,
  NAVIGATION_SPAN_NAME_FALLBACK,
  type Span,
  spanToJSON,
} from '@sentry/core';

type Options = Parameters<typeof originalBrowserTracingIntegration>[0];

// The `Server-Timing` entry the server middleware adds to HTML responses, carrying the matched route
// pattern. It feeds the route provider, which is where span names come from.
const ROUTE_TIMING_NAME = 'sentry-route';

/**
 * Browser tracing for Remix 3.
 *
 * Page loads stay with the upstream integration, because they are ordinary document loads. Navigations
 * do not: `remix/component` intercepts links and form submissions through the Navigation API and never touches
 * History, so the upstream handler never fires.
 *
 * Page load spans are named through the route provider, which learns the route from the document's
 * response.
 */
export function browserTracingIntegration(options: Options = {}): Integration {
  const integration = originalBrowserTracingIntegration({ ...options, instrumentNavigation: false });

  return {
    ...integration,
    afterAllSetup(client) {
      integration.afterAllSetup(client);

      if (options.instrumentPageLoad !== false) {
        nameActivePageLoadSpan(client);
      }
      if (options.instrumentNavigation !== false) {
        instrumentNavigationApi(client);
      }
    },
  };
}

/** The page load span the upstream integration just started, named after the route that served the document. */
function nameActivePageLoadSpan(client: Client): void {
  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    return;
  }

  const rootSpan = getRootSpan(activeSpan);
  if (spanToJSON(rootSpan).attributes[SENTRY_OP] !== 'pageload') {
    return;
  }

  recordRoute(client, WINDOW.location?.pathname, getDocumentRoute());
  const route = resolveCurrentRoute(client);
  if (route) {
    applyRoute(rootSpan, route);
  }
}

function instrumentNavigationApi(client: Client): void {
  const navigation = (WINDOW as WindowWithNavigation).navigation;
  if (!navigation) {
    // Without the Navigation API the runtime does full document loads, which are page loads already.
    return;
  }

  navigation.addEventListener('navigate', event => {
    const url = event.destination?.url;
    if (!url || !isRuntimeNavigation(event, url)) {
      return;
    }

    startBrowserTracingNavigationSpan(
      client,
      {
        // Low cardinality: the route arrives with the server's response, which navigations do not read yet.
        name: hasSpanStreamingEnabled(client) ? NAVIGATION_SPAN_NAME_FALLBACK : pathnameOf(url) || '/',
        attributes: {
          [SENTRY_SEGMENT_NAME_SOURCE]: 'url',
          [SENTRY_ORIGIN]: 'auto.navigation.remix_v3',
        },
      },
      // The span needs the destination: `location` still points at the previous page until the
      // navigation finishes.
      { url },
    );
  });
}

/** Hands a route the server reported to the provider, when it is one that takes them. */
function recordRoute(client: Client, pathname: string | undefined, route: string | undefined): void {
  const provider = getRouteProvider(client);
  if (provider && 'record' in provider && typeof provider.record === 'function') {
    provider.record(pathname, route);
  }
}

/**
 * Renames a span that started under the fallback. The scope's transaction name follows, so errors
 * group by route too, but only while this is still the current span.
 */
function applyRoute(span: Span, route: string): void {
  span.updateName(route);
  span.setAttributes({ [SENTRY_SEGMENT_NAME_SOURCE]: 'route', [URL_TEMPLATE]: route });
  const activeSpan = getActiveSpan();
  if (activeSpan && getRootSpan(activeSpan) === span) {
    getCurrentScope().setTransactionName(route);
  }
}

/** The route from the document response, read off the navigation timing entry. */
function getDocumentRoute(): string | undefined {
  const entry = WINDOW.performance?.getEntriesByType?.('navigation')[0] as
    | { serverTiming?: Array<{ name: string; description: string }> }
    | undefined;
  return entry?.serverTiming?.find(timing => timing.name === ROUTE_TIMING_NAME)?.description;
}

/**
 * Whether the runtime will keep this navigation inside the current document.
 *
 * The same three conditions `startNavigationListener` in `@remix-run/component` checks before intercepting.
 * What it declines becomes a new document load, which already gets a page load span, so a navigation
 * span here would count the same click twice.
 */
function isRuntimeNavigation(event: NavigateEventLike, url: string): boolean {
  // `'remix-document-reload'` is the `info` value the runtime tags its own document reloads with.
  return event.canIntercept && event.info !== 'remix-document-reload' && isSameOrigin(url);
}

function isSameOrigin(url: string): boolean {
  try {
    return new URL(url).origin === WINDOW.location?.origin;
  } catch {
    return false;
  }
}

function pathnameOf(url: string): string | undefined {
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
}

interface NavigateEventLike extends Event {
  canIntercept: boolean;
  info?: unknown;
  destination?: { url: string };
}

type WindowWithNavigation = typeof WINDOW & {
  navigation?: { addEventListener(type: 'navigate', listener: (event: NavigateEventLike) => void): void };
};
