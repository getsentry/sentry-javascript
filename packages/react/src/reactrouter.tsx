import {
  WINDOW,
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from '@sentry/browser';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  spanToJSON,
} from '@sentry/core';
import type { Client, Integration, Span, TransactionSource } from '@sentry/core';
import hoistNonReactStatics from 'hoist-non-react-statics';
import * as React from 'react';
import type { ReactElement } from 'react';

import type { Action, Location } from './types';

// We need to disable eslint no-explicit-any because any is required for the
// react-router typings.
type Match = { path: string; url: string; params: Record<string, any>; isExact: boolean }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type RouterHistory = {
  location?: Location;
  listen?(cb: (location: Location, action: Action) => void): void;
} & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type RouteConfig = {
  [propName: string]: unknown;
  path?: string | string[];
  exact?: boolean;
  component?: ReactElement;
  routes?: RouteConfig[];
};

export type MatchPath = (pathname: string, props: string | string[] | any, parent?: Match | null) => Match | null; // eslint-disable-line @typescript-eslint/no-explicit-any

interface ReactRouterOptions {
  history: RouterHistory;
  routes?: RouteConfig[];
  matchPath?: MatchPath;
}

/**
 * A browser tracing integration that uses React Router v4 to instrument navigations.
 * Expects `history` (and optionally `routes` and `matchPath`) to be passed as options.
 */
export function reactRouterV4BrowserTracingIntegration(
  options: Parameters<typeof browserTracingIntegration>[0] & ReactRouterOptions,
): Integration {
  const integration = browserTracingIntegration({
    ...options,
    instrumentPageLoad: false,
    instrumentNavigation: false,
  });

  const { history, routes, matchPath, instrumentPageLoad = true, instrumentNavigation = true } = options;

  return {
    ...integration,
    afterAllSetup(client) {
      integration.afterAllSetup(client);

      instrumentReactRouter(
        client,
        instrumentPageLoad,
        instrumentNavigation,
        history,
        'reactrouter_v4',
        routes,
        matchPath,
      );
    },
  };
}

/**
 * A browser tracing integration that uses React Router v5 to instrument navigations.
 * Expects `history` (and optionally `routes` and `matchPath`) to be passed as options.
 */
export function reactRouterV5BrowserTracingIntegration(
  options: Parameters<typeof browserTracingIntegration>[0] & ReactRouterOptions,
): Integration {
  const integration = browserTracingIntegration({
    ...options,
    instrumentPageLoad: false,
    instrumentNavigation: false,
  });

  const { history, routes, matchPath, instrumentPageLoad = true, instrumentNavigation = true } = options;

  return {
    ...integration,
    afterAllSetup(client) {
      integration.afterAllSetup(client);

      instrumentReactRouter(
        client,
        instrumentPageLoad,
        instrumentNavigation,
        history,
        'reactrouter_v5',
        routes,
        matchPath,
      );
    },
  };
}

function instrumentReactRouter(
  client: Client,
  instrumentPageLoad: boolean,
  instrumentNavigation: boolean,
  history: RouterHistory,
  instrumentationName: string,
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
    for (const branch of branches) {
      if (branch.match.isExact) {
        return [branch.match.path, 'route'];
      }
    }

    return [pathname, 'url'];
  }

  if (instrumentPageLoad) {
    const initPathName = getInitPathName();
    if (initPathName) {
      const [name, source] = normalizeTransactionName(initPathName);
      startBrowserTracingPageLoadSpan(client, {
        name,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: `auto.pageload.react.${instrumentationName}`,
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
        },
      });
    }
  }

  if (instrumentNavigation && history.listen) {
    history.listen((location, action) => {
      if (action && (action === 'PUSH' || action === 'POP')) {
        const [name, source] = normalizeTransactionName(location.pathname);
        startBrowserTracingNavigationSpan(client, {
          name,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: `auto.navigation.react.${instrumentationName}`,
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
          },
        });
      }
    });
  }
}

/**
 * Matches a set of routes to a pathname
 * Based on implementation from
 */
function matchRoutes(
  routes: RouteConfig[],
  pathname: string,
  matchPath: MatchPath,
  branch: Array<{ route: RouteConfig; match: Match }> = [],
): Array<{ route: RouteConfig; match: Match }> {
  routes.some(route => {
    const match = route.path
      ? matchPath(pathname, route)
      : branch.length
        ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          branch[branch.length - 1]!.match // use parent match
        : computeRootMatch(pathname); // use default "root" match

    if (match) {
      branch.push({ route, match });

      if (route.routes) {
        matchRoutes(route.routes, pathname, matchPath, branch);
      }
    }

    return !!match;
  });

  return branch;
}

function computeRootMatch(pathname: string): Match {
  return { path: '/', url: '/', params: {}, isExact: pathname === '/' };
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
export function withSentryRouting<P extends Record<string, any>, R extends React.ComponentType<P>>(Route: R): R {
  const componentDisplayName = Route.displayName || Route.name;

  const WrappedRoute: React.FC<P> = (props: P) => {
    if (props && props.computedMatch && props.computedMatch.isExact) {
      const route = props.computedMatch.path;
      const activeRootSpan = getActiveRootSpan();

      getCurrentScope().setTransactionName(route);

      if (activeRootSpan) {
        activeRootSpan.updateName(route);
        activeRootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
      }
    }

    // @ts-expect-error Setting more specific React Component typing for `R` generic above
    // will break advanced type inference done by react router params:
    // https://github.com/DefinitelyTyped/DefinitelyTyped/blob/13dc4235c069e25fe7ee16e11f529d909f9f3ff8/types/react-router/index.d.ts#L154-L164
    return <Route {...props} />;
  };

  WrappedRoute.displayName = `sentryRoute(${componentDisplayName})`;
  hoistNonReactStatics(WrappedRoute, Route);
  // @ts-expect-error Setting more specific React Component typing for `R` generic above
  // will break advanced type inference done by react router params:
  // https://github.com/DefinitelyTyped/DefinitelyTyped/blob/13dc4235c069e25fe7ee16e11f529d909f9f3ff8/types/react-router/index.d.ts#L154-L164
  return WrappedRoute;
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

function getActiveRootSpan(): Span | undefined {
  const span = getActiveSpan();
  const rootSpan = span && getRootSpan(span);

  if (!rootSpan) {
    return undefined;
  }

  const op = spanToJSON(rootSpan).op;

  // Only use this root span if it is a pageload or navigation span
  return op === 'navigation' || op === 'pageload' ? rootSpan : undefined;
}
