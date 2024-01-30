import type { Match, MatchPath, RouteConfig } from './types';

/**
 * Matches a set of routes to a pathname
 */
export function matchRoutes(
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
