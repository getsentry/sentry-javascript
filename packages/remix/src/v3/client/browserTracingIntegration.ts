import {
  browserTracingIntegration as originalBrowserTracingIntegration,
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  getRouteProvider,
  resolveCurrentRoute,
  resolveRoute,
  startBrowserTracingNavigationSpan,
  WINDOW,
} from '@sentry/browser';
import { SENTRY_OP, SENTRY_ORIGIN, SENTRY_SEGMENT_NAME_SOURCE, URL_TEMPLATE } from '@sentry/conventions/attributes';
import {
  addFetchInstrumentationHandler,
  type Client,
  hasSpanStreamingEnabled,
  type Integration,
  NAVIGATION_SPAN_NAME_FALLBACK,
  type Span,
  spanToJSON,
} from '@sentry/core';

import { ROUTE_TIMING_NAME } from '../routeTiming';

type Options = Parameters<typeof originalBrowserTracingIntegration>[0];

/**
 * Browser tracing for Remix 3.
 *
 * Page loads stay with the upstream integration, because they are ordinary document loads. Navigations
 * do not: `remix/component` intercepts links and form submissions through the Navigation API and never touches
 * History, so the upstream handler never fires.
 *
 * Spans are named through the route provider. Routes reach it from the server, with each HTML
 * response, so a span starts under a low cardinality name when its route is not known yet and is
 * renamed once the response arrives.
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

  // Navigation spans still waiting for their route, which arrives with the response to the runtime's
  // fetch of the destination. Keyed by pathname: a second navigation before the first response must
  // not lose either span. Bounded, because a fetch that fails never reports back for its entry.
  const pending = new Map<string, { span: Span; url: string }>();
  const MAX_PENDING = 20;

  navigation.addEventListener('navigate', event => {
    const url = event.destination?.url;
    if (!url || !isRuntimeNavigation(event, url)) {
      return;
    }

    const pathname = pathnameOf(url) || '/';
    // Known when the app loaded this route before.
    const route = resolveRoute(url, client);
    const span = startBrowserTracingNavigationSpan(
      client,
      {
        name: route ?? (hasSpanStreamingEnabled(client) ? NAVIGATION_SPAN_NAME_FALLBACK : pathname),
        attributes: {
          [SENTRY_SEGMENT_NAME_SOURCE]: route ? 'route' : 'url',
          ...(route && { [URL_TEMPLATE]: route }),
          [SENTRY_ORIGIN]: 'auto.navigation.remix_v3',
        },
      },
      // The span needs the destination: `location` still points at the previous page until the
      // navigation finishes.
      { url },
    );

    if (span && !route) {
      // A repeat of the same path replaces its entry; the Navigation API aborted the earlier intercept.
      pending.delete(pathname);
      pending.set(pathname, { span, url });
      while (pending.size > MAX_PENDING) {
        pending.delete(pending.keys().next().value as string);
      }
    }
  });

  addFetchInstrumentationHandler(({ fetchData, response }) => {
    if (pending.size === 0 || !response) {
      // A failed fetch does not settle the entry: the Navigation API aborts the previous intercept when
      // a new navigation starts, and that rejection lands after the new one re-queued the same path.
      return;
    }
    // The runtime fetches the destination itself. Any other fetch during the navigation is the app's.
    const pathname = pathnameOf(fetchData.url, WINDOW.location?.href);
    const waiting = pathname && pending.get(pathname);
    if (!pathname || !waiting) {
      return;
    }
    pending.delete(pathname);

    // The route belongs to the URL that answered. After a redirect that is not the one requested, and
    // recording it under the requested path would misname every later visit there.
    const servedPathname = pathnameOf(response.url, WINDOW.location?.href) || pathname;
    recordRoute(client, servedPathname, parseRouteTiming(response.headers.get('server-timing')));
    const route = resolveRoute(response.url || waiting.url, client);
    if (route) {
      applyRoute(waiting.span, route);
    }
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
 * group by route too, but only while this is still the current navigation: a late response for an
 * earlier one must not overwrite the route the user is on now.
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

/** The route from a raw `Server-Timing` header, as the fetch response exposes it. */
function parseRouteTiming(header: string | null): string | undefined {
  const quoted = header?.match(new RegExp(`(?:^|,)\\s*${ROUTE_TIMING_NAME};desc="((?:[^"\\\\]|\\\\.)*)"`))?.[1];
  return quoted?.replace(/\\(.)/g, '$1');
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

function pathnameOf(url: string, base?: string): string | undefined {
  try {
    return new URL(url, base).pathname;
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
