import { Transaction } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils';
import hoistNonReactStatics from 'hoist-non-react-statics';
import * as React from 'react';

import { Action, Location, ReactRouterInstrumentation } from './types';

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

interface RouteProps {
  [propName: string]: any;
  location?: Location;
  component?: React.ComponentType<any> | React.ComponentType<any>;
  render?: (props: any) => React.ReactNode;
  children?: ((props: any) => React.ReactNode) | React.ReactNode;
  path?: string | string[];
  exact?: boolean;
  sensitive?: boolean;
  strict?: boolean;
}

type MatchPath = (pathname: string, props: string | string[] | any, parent?: Match | null) => Match | null;
/* eslint-enable @typescript-eslint/no-explicit-any */

const global = getGlobalObject<Window>();

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
  function getTransactionName(pathname: string): string {
    if (allRoutes === [] || !matchPath) {
      return pathname;
    }

    const branches = matchRoutes(allRoutes, pathname, matchPath);
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let x = 0; x < branches.length; x++) {
      if (branches[x].match.isExact) {
        return branches[x].match.path;
      }
    }

    return pathname;
  }

  return (customStartTransaction, startTransactionOnPageLoad = true, startTransactionOnLocationChange = true): void => {
    if (startTransactionOnPageLoad && global && global.location) {
      activeTransaction = customStartTransaction({
        name: getTransactionName(global.location.pathname),
        op: 'pageload',
        tags: {
          'routing.instrumentation': name,
        },
      });
    }

    if (startTransactionOnLocationChange && history.listen) {
      history.listen((location, action) => {
        if (action && (action === 'PUSH' || action === 'POP')) {
          if (activeTransaction) {
            activeTransaction.finish();
          }
          const tags = {
            'routing.instrumentation': name,
          };

          activeTransaction = customStartTransaction({
            name: getTransactionName(location.pathname),
            op: 'navigation',
            tags,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withSentryRouting<P extends RouteProps & Record<string, any>>(
  Route: React.ComponentType<P>,
): React.FC<P> {
  const componentDisplayName = Route.displayName || Route.name;

  const WrappedRoute: React.FC<P> = (props: P) => {
    if (activeTransaction && props && props.computedMatch && props.computedMatch.isExact) {
      activeTransaction.setName(props.computedMatch.path);
    }
    return <Route {...props} />;
  };

  WrappedRoute.displayName = `sentryRoute(${componentDisplayName})`;
  hoistNonReactStatics(WrappedRoute, Route);
  return WrappedRoute;
}
