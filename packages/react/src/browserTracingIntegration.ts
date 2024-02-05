import {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from '@sentry/browser';
import type { Integration, StartSpanOptions } from '@sentry/types';
import type { MatchPath, RouteConfig, RouterHistory } from './reactrouter';
import { reactRouterV5Instrumentation } from './reactrouter';
import { reactRouterV4Instrumentation } from './reactrouter';

interface ReactRouterOptions {
  history: RouterHistory;
  routes?: RouteConfig[];
  matchPath?: MatchPath;
}

/**
 * A browser tracing integration that uses React Router v4 to instrument navigations.
 * Expects `history` (and optionally `routes` and `matchPath`) to be passed as options.
 */
export function browserTracingReactRouterV4Integration(
  options: Parameters<typeof browserTracingIntegration>[0] & ReactRouterOptions,
): Integration {
  const integration = browserTracingIntegration(options);

  const { history, routes, matchPath, instrumentPageLoad = true, instrumentNavigation = true } = options;

  return {
    ...integration,
    afterAllSetup(client) {
      integration.afterAllSetup(client);
      const startPageloadCallback = (startSpanOptions: StartSpanOptions): undefined => {
        startBrowserTracingPageLoadSpan(client, startSpanOptions);
        return undefined;
      };

      const startNavigationCallback = (startSpanOptions: StartSpanOptions): undefined => {
        startBrowserTracingNavigationSpan(client, startSpanOptions);
        return undefined;
      };

      // eslint-disable-next-line deprecation/deprecation
      const instrumentation = reactRouterV4Instrumentation(history, routes, matchPath);

      // Now instrument page load & navigation with correct settings
      instrumentation(startPageloadCallback, instrumentPageLoad, false);
      instrumentation(startNavigationCallback, false, instrumentNavigation);
    },
  };
}

/**
 * A browser tracing integration that uses React Router v5 to instrument navigations.
 * Expects `history` (and optionally `routes` and `matchPath`) to be passed as options.
 */
export function browserTracingReactRouterV5Integration(
  options: Parameters<typeof browserTracingIntegration>[0] & ReactRouterOptions,
): Integration {
  const integration = browserTracingIntegration(options);

  const { history, routes, matchPath } = options;

  return {
    ...integration,
    afterAllSetup(client) {
      integration.afterAllSetup(client);

      const startPageloadCallback = (startSpanOptions: StartSpanOptions): undefined => {
        startBrowserTracingPageLoadSpan(client, startSpanOptions);
        return undefined;
      };

      const startNavigationCallback = (startSpanOptions: StartSpanOptions): undefined => {
        startBrowserTracingNavigationSpan(client, startSpanOptions);
        return undefined;
      };

      // eslint-disable-next-line deprecation/deprecation
      const instrumentation = reactRouterV5Instrumentation(history, routes, matchPath);

      // Now instrument page load & navigation with correct settings
      instrumentation(startPageloadCallback, options.instrumentPageLoad, false);
      instrumentation(startNavigationCallback, false, options.instrumentNavigation);
    },
  };
}
