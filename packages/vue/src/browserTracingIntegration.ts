import {
  browserTracingIntegration as originalBrowserTracingIntegration,
  startBrowserTracingNavigationSpan,
} from '@sentry/browser';
import type { Integration, StartSpanOptions } from '@sentry/types';
import { instrumentVueRouter } from './router';

// The following type is an intersection of the Route type from VueRouter v2, v3, and v4.
// This is not great, but kinda necessary to make it work with all versions at the same time.
export type Route = {
  /** Unparameterized URL */
  path: string;
  /**
   * Query params (keys map to null when there is no value associated, e.g. "?foo" and to an array when there are
   * multiple query params that have the same key, e.g. "?foo&foo=bar")
   */
  query: Record<string, string | null | (string | null)[]>;
  /** Route name (VueRouter provides a way to give routes individual names) */
  name?: string | symbol | null | undefined;
  /** Evaluated parameters */
  params: Record<string, string | string[]>;
  /** All the matched route objects as defined in VueRouter constructor */
  matched: { path: string }[];
};

interface VueRouter {
  onError: (fn: (err: Error) => void) => void;
  beforeEach: (fn: (to: Route, from: Route, next?: () => void) => void) => void;
}

type VueBrowserTracingIntegrationOptions = Parameters<typeof originalBrowserTracingIntegration>[0] & {
  /**
   * If a router is specified, navigation spans will be created based on the router.
   */
  router?: VueRouter;

  /**
   * What to use for route labels.
   * By default, we use route.name (if set) and else the path.
   *
   * Default: 'name'
   */
  routeLabel?: 'name' | 'path';
};

/**
 * A custom browser tracing integrations for Vue.
 */
export function browserTracingIntegration(options: VueBrowserTracingIntegrationOptions = {}): Integration {
  // If router is not passed, we just use the normal implementation
  if (!options.router) {
    return originalBrowserTracingIntegration(options);
  }

  const integration = originalBrowserTracingIntegration({
    ...options,
    instrumentNavigation: false,
  });

  const { router, instrumentNavigation = true, instrumentPageLoad = true, routeLabel = 'name' } = options;

  return {
    ...integration,
    afterAllSetup(client) {
      integration.afterAllSetup(client);

      const startNavigationSpan = (options: StartSpanOptions): void => {
        startBrowserTracingNavigationSpan(client, options);
      };

      instrumentVueRouter(router, { routeLabel, instrumentNavigation, instrumentPageLoad }, startNavigationSpan);
    },
  };
}
