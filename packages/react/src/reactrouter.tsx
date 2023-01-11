import { WINDOW } from '@sentry/browser';
import type { Transaction, TransactionSource } from '@sentry/types';
import hoistNonReactStatics from 'hoist-non-react-statics';
import * as React from 'react';

import type { Action, Location, ReactRouterInstrumentation } from './types';

// We need to disable eslint no-explict-any because any is required for the
// react-router typings.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Match = { path: string; url: string; params: Record<string, any>; isExact: boolean };

export type RouterHistory = {
  location?: Location;
  listen?(cb: (location: Location, action: Action) => void): void;
} & Record<string, any>;

export type RouteConfig = {
  [propName: string]: any;
  path?: string | string[];
  exact?: boolean;
  component?: JSX.Element;
  routes?: RouteConfig[];
};

type MatchPath = (pathname: string, props: string | string[] | any, parent?: Match | null) => Match | null;
/* eslint-enable @typescript-eslint/no-explicit-any */

let activeTransaction: Transaction | undefined;

export function reactRouterV4Instrumentation(
  history: RouterHistory,
  routes?: RouteConfig[],
  matchPath?: MatchPath,
): ReactRouterInstrumentation {
  return createReactRouterInstrumentation(history, 'react-router-v4', routes, matchPath);
}

export function reactRouterV5Instrumentation(
  history: RouterHistory,
  routes?: RouteConfig[],
  matchPath?: MatchPath,
): ReactRouterInstrumentation {
  return createReactRouterInstrumentation(history, 'react-router-v5', routes, matchPath);
}

function createReactRouterInstrumentation(
  history: RouterHistory,
  name: string,
  allRoutes: RouteConfig[] = [],
  matchPath?: MatchPath,
): ReactRouterInstrumentation {
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
    'routing.instrumentation': name,
  };

  return (customStartTransaction, startTransactionOnPageLoad = true, startTransactionOnLocationChange = true): void => {
    const initPathName = getInitPathName();
    if (startTransactionOnPageLoad && initPathName) {
      const [name, source] = normalizeTransactionName(initPathName);
      activeTransaction = customStartTransaction({
        name,
        op: 'pageload',
        tags,
        metadata: {
          source,
        },
      });
    }

    if (startTransactionOnLocationChange && history.listen) {
      history.listen((location, action) => {
        if (action && (action === 'PUSH' || action === 'POP')) {
          if (activeTransaction) {
            activeTransaction.finish();
          }

          const [name, source] = normalizeTransactionName(location.pathname);
          activeTransaction = customStartTransaction({
            name,
            op: 'navigation',
            tags,
            metadata: {
              source,
            },
          });
        }
      });
    }
  };
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
      ? branch[branch.length - 1].match // use parent match
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
  const componentDisplayName = (Route as any).displayName || (Route as any).name;

  const WrappedRoute: React.FC<P> = (props: P) => {
    if (activeTransaction && props && props.computedMatch && props.computedMatch.isExact) {
      activeTransaction.setName(props.computedMatch.path, 'route');
    }

    // @ts-ignore Setting more specific React Component typing for `R` generic above
    // will break advanced type inference done by react router params:
    // https://github.com/DefinitelyTyped/DefinitelyTyped/blob/13dc4235c069e25fe7ee16e11f529d909f9f3ff8/types/react-router/index.d.ts#L154-L164
    return <Route {...props} />;
  };

  WrappedRoute.displayName = `sentryRoute(${componentDisplayName})`;
  hoistNonReactStatics(WrappedRoute, Route);
  // @ts-ignore Setting more specific React Component typing for `R` generic above
  // will break advanced type inference done by react router params:
  // https://github.com/DefinitelyTyped/DefinitelyTyped/blob/13dc4235c069e25fe7ee16e11f529d909f9f3ff8/types/react-router/index.d.ts#L154-L164
  return WrappedRoute;
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
