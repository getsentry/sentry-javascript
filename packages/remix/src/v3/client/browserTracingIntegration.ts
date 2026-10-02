import {
  browserTracingIntegration as originalBrowserTracingIntegration,
  startBrowserTracingNavigationSpan,
  WINDOW,
} from '@sentry/browser';
import { SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import {
  type Client,
  hasSpanStreamingEnabled,
  type Integration,
  NAVIGATION_SPAN_NAME_FALLBACK,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
} from '@sentry/core';

type Options = Parameters<typeof originalBrowserTracingIntegration>[0];

/**
 * Browser tracing for Remix 3.
 *
 * Page loads stay with the upstream integration, because they are ordinary document loads. Navigations
 * do not: `remix/component` intercepts links and form submissions through the Navigation API and never touches
 * History, so the upstream handler never fires.
 */
export function browserTracingIntegration(options: Options = {}): Integration {
  const integration = originalBrowserTracingIntegration({ ...options, instrumentNavigation: false });

  return {
    ...integration,
    afterAllSetup(client) {
      integration.afterAllSetup(client);

      if (options.instrumentNavigation !== false) {
        instrumentNavigationApi(client);
      }
    },
  };
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
        // Remix 3 gives the browser no route to name this after: `remix/component` exposes no matched route
        // and never matches client side. Passing the server's pattern down is tracked in (#24872).
        name: hasSpanStreamingEnabled(client) ? NAVIGATION_SPAN_NAME_FALLBACK : pathnameOf(url) || '/',
        attributes: {
          [SENTRY_SEGMENT_NAME_SOURCE]: 'url',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.remix_v3',
        },
      },
      // The span needs the destination: `location` still points at the previous page until the
      // navigation finishes.
      { url },
    );
  });
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
