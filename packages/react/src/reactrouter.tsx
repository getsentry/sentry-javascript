import { Transaction } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils';
import * as React from 'react';

import { Action, Location, ReactRouterInstrumentation } from './types';

type Match = { path: string; url: string; params: Record<string, any>; isExact: boolean };

export type RouterHistory = {
  location?: Location;
  listen?(cb: (location: Location, action: Action) => void): void;
} & Record<string, any>;

export type RouteConfig = {
  path?: string | string[];
  exact?: boolean;
  component?: JSX.Element;
  routes?: RouteConfig[];
  [propName: string]: any;
};

type MatchPath = (pathname: string, props: string | string[] | any, parent?: Match | null) => Match | null;

const global = getGlobalObject<Window>();

let activeTransaction: Transaction | undefined;

export function reactRouterV4Instrumentation(
  history: RouterHistory,
  routes?: RouteConfig[],
  matchPath?: MatchPath,
): ReactRouterInstrumentation {
  return reactRouterInstrumentation(history, 'react-router-v4', routes, matchPath);
}

export function reactRouterV5Instrumentation(
  history: RouterHistory,
  routes?: RouteConfig[],
  matchPath?: MatchPath,
): ReactRouterInstrumentation {
  return reactRouterInstrumentation(history, 'react-router-v5', routes, matchPath);
}

function reactRouterInstrumentation(
  history: RouterHistory,
  name: string,
  allRoutes: RouteConfig[] = [],
  matchPath?: MatchPath,
): ReactRouterInstrumentation {
  function getName(pathname: string): string {
    if (allRoutes === [] || !matchPath) {
      return pathname;
    }

    const branches = matchRoutes(allRoutes, pathname, matchPath);
    // tslint:disable-next-line: prefer-for-of
    for (let x = 0; x < branches.length; x++) {
      if (branches[x].match.isExact) {
        return branches[x].match.path;
      }
    }

    return pathname;
  }

  return (startTransaction, startTransactionOnPageLoad = true, startTransactionOnLocationChange = true) => {
    if (startTransactionOnPageLoad && global && global.location) {
      activeTransaction = startTransaction({
        name: getName(global.location.pathname),
        op: 'pageload',
        tags: {
          'routing.instrumentation': name,
        },
      });
    }

    if (startTransactionOnLocationChange && history.listen) {
      history.listen((location, action) => {
        // console.log(location, action);
        if (action && action === 'PUSH') {
          if (activeTransaction) {
            activeTransaction.finish();
          }
          const tags = {
            'routing.instrumentation': name,
          };

          activeTransaction = startTransaction({
            name: getName(location.pathname),
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

export const withSentryRouting = (Route: React.ElementType) => (props: any) => {
  // tslint:disable: no-unsafe-any
  if (activeTransaction && props && props.computedMatch && props.computedMatch.isExact) {
    activeTransaction.setName(props.computedMatch.path);
  }
  return <Route {...props} />;
  // tslint:enable: no-unsafe-any
};
