import type { Client, Integration } from '@sentry/core';
import {
  GLOBAL_OBJ,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import {
  browserTracingIntegration as originalBrowserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from '@sentry/react';

const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;

/**
 * A custom browser tracing integration for vinext.
 *
 * This wraps the standard browser tracing integration with vinext-specific
 * page load and navigation instrumentation for both the Pages Router and App Router.
 */
export function browserTracingIntegration(
  options: Parameters<typeof originalBrowserTracingIntegration>[0] = {},
): Integration {
  const browserTracingIntegrationInstance = originalBrowserTracingIntegration({
    ...options,
    instrumentNavigation: false,
    instrumentPageLoad: false,
  });

  const { instrumentPageLoad = true, instrumentNavigation = true } = options;

  return {
    ...browserTracingIntegrationInstance,
    afterAllSetup(client) {
      browserTracingIntegrationInstance.afterAllSetup(client);

      if (instrumentPageLoad) {
        instrumentVinextPageLoad(client);
      }

      if (instrumentNavigation) {
        instrumentVinextNavigation(client);
      }
    },
  };
}

function instrumentVinextPageLoad(client: Client): void {
  const route = getRouteFromWindow();
  startBrowserTracingPageLoadSpan(client, {
    name: route || WINDOW.location.pathname,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.vinext',
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: route ? 'route' : 'url',
    },
  });
}

function instrumentVinextNavigation(client: Client): void {
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function (...args) {
    const result = originalPushState(...args);
    startNavigationSpan(client, 'pushState');
    return result;
  };

  history.replaceState = function (...args) {
    const result = originalReplaceState(...args);
    startNavigationSpan(client, 'replaceState');
    return result;
  };

  WINDOW.addEventListener('popstate', () => {
    startNavigationSpan(client, 'popstate');
  });
}

function startNavigationSpan(client: Client, trigger: string): void {
  startBrowserTracingNavigationSpan(client, {
    name: WINDOW.location.pathname,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.vinext',
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
      'vinext.navigation.trigger': trigger,
    },
  });
}

/**
 * Attempts to extract a parameterized route from the vinext __NEXT_DATA__ object
 * (which vinext injects for Pages Router compatibility).
 */
function getRouteFromWindow(): string | undefined {
  try {
    const nextData = (GLOBAL_OBJ as unknown as Record<string, unknown>).__NEXT_DATA__ as { page?: string } | undefined;
    if (nextData?.page && nextData.page !== '/') {
      return nextData.page;
    }
  } catch {
    // noop
  }
  return undefined;
}
