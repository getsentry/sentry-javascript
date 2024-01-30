import { WINDOW, startBrowserTracingNavigationSpan, startBrowserTracingPageLoadSpan } from '@sentry/browser';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  defineIntegration,
} from '@sentry/core';
import type { Client, IntegrationFn, TransactionSource } from '@sentry/types';
import { logger } from '@sentry/utils';
import { DEBUG_BUILD } from '../debug-build';
import { V4_SETUP_CLIENTS, V5_SETUP_CLIENTS } from './global-flags';
import { matchRoutes } from './route-utils';
import type { MatchPath, RouteConfig, RouterHistory } from './types';

const INTEGRATION_NAME_V4 = 'ReactRouterV4';

const INTEGRATION_NAME_V5 = 'ReactRouterV5';

interface DefaultReactRouterOptions {
  /**
   * The history object from `createBrowserHistory` (or equivalent).
   */
  history: RouterHistory;
}

interface RouteConfigReactRouterOptions extends DefaultReactRouterOptions {
  /**
   * An array of route configs as per the `react-router-config` library
   */
  routes: RouteConfig[];
  /**
   * The `matchPath` function from the `react-router` library
   */
  matchPath: MatchPath;
}

/**
 * Options for React Router v4 and v4 integration
 */
type ReactRouterOptions = DefaultReactRouterOptions | RouteConfigReactRouterOptions;

// @ts-expect-error Don't type narrow on routes or matchPath to save on bundle size
const _reactRouterV4 = (({ history, routes, matchPath }: ReactRouterOptions) => {
  return {
    name: INTEGRATION_NAME_V4,
    // TODO v8: Remove this
    setupOnce() {}, // eslint-disable-line @typescript-eslint/no-empty-function
    setup(client) {
      V4_SETUP_CLIENTS.set(client, true);
      startRoutingInstrumentation('react-router-v4', client, history, routes, matchPath);
    },
  };
}) satisfies IntegrationFn;

// @ts-expect-error Don't type narrow on routes or matchPath to save on bundle size
const _reactRouterV5 = (({ history, routes, matchPath }: ReactRouterOptions) => {
  return {
    name: INTEGRATION_NAME_V5,
    // TODO v8: Remove this
    setupOnce() {}, // eslint-disable-line @typescript-eslint/no-empty-function
    setup(client) {
      V5_SETUP_CLIENTS.set(client, true);
      startRoutingInstrumentation('react-router-v5', client, history, routes, matchPath);
    },
  };
}) satisfies IntegrationFn;

/**
 * An integration for React Router v4, meant to be used with
 * `browserTracingIntegration`.
 */
export const reactRouterV4Integration = defineIntegration(_reactRouterV4);

/**
 * An integration for React Router v5, meant to be used with
 * `browserTracingIntegration`.
 */
export const reactRouterV5Integration = defineIntegration(_reactRouterV5);

function startRoutingInstrumentation(
  routerName: 'react-router-v4' | 'react-router-v5',
  client: Client,
  history: RouterHistory,
  allRoutes: RouteConfig[] = [],
  matchPath?: MatchPath,
): void {
  function getInitPathName(): string | undefined {
    if (history && history.location) {
      return history.location.pathname;
    }

    if (WINDOW && WINDOW.location) {
      return WINDOW.location.pathname;
    }

    return undefined;
  }

  /**
   * Normalizes a transaction name. Returns the new name as well as the
   * source of the transaction.
   *
   * @param pathname The initial pathname we normalize
   */
  function normalizeTransactionName(pathname: string): [string, TransactionSource] {
    if (allRoutes.length === 0 || !matchPath) {
      return [pathname, 'url'];
    }

    const branches = matchRoutes(allRoutes, pathname, matchPath);
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let x = 0; x < branches.length; x++) {
      if (branches[x].match.isExact) {
        return [branches[x].match.path, 'route'];
      }
    }

    return [pathname, 'url'];
  }

  const tags = {
    'routing.instrumentation': routerName,
  };

  const initPathName = getInitPathName();
  if (initPathName) {
    const [name, source] = normalizeTransactionName(initPathName);
    startBrowserTracingPageLoadSpan(client, {
      name,
      tags,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.react.reactrouter',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
      },
    });
  }

  if (history.listen) {
    history.listen((location, action) => {
      if (action && (action === 'PUSH' || action === 'POP')) {
        const [name, source] = normalizeTransactionName(location.pathname);
        startBrowserTracingNavigationSpan(client, {
          name,
          tags,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter',
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          },
        });
      }
    });
  } else {
    DEBUG_BUILD &&
      logger.warn('history.listen is not available, automatic instrumentation for navigations will not work.');
  }
}
