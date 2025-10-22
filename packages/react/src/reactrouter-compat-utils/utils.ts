import type { TransactionSource } from '@sentry/core';
import type { Location, MatchRoutes, RouteMatch, RouteObject } from '../types';

// Global variables that these utilities depend on
let _matchRoutes: MatchRoutes;
let _stripBasename: boolean = false;

/**
 * Initialize function to set dependencies that the router utilities need.
 * Must be called before using any of the exported utility functions.
 */
export function initializeRouterUtils(matchRoutes: MatchRoutes, stripBasename: boolean = false): void {
  _matchRoutes = matchRoutes;
  _stripBasename = stripBasename;
}

// Helper functions
function pickPath(match: RouteMatch): string {
  return trimWildcard(match.route.path || '');
}

function pickSplat(match: RouteMatch): string {
  return match.params['*'] || '';
}

function trimWildcard(path: string): string {
  return path[path.length - 1] === '*' ? path.slice(0, -1) : path;
}

function trimSlash(path: string): string {
  return path[path.length - 1] === '/' ? path.slice(0, -1) : path;
}

/**
 * Checks if a path ends with a wildcard character (*).
 */
export function pathEndsWithWildcard(path: string): boolean {
  return path.endsWith('*');
}

/**
 * Checks if a path is a wildcard and has child routes.
 */
export function pathIsWildcardAndHasChildren(path: string, branch: RouteMatch<string>): boolean {
  return (pathEndsWithWildcard(path) && !!branch.route.children?.length) || false;
}

/**
 *
 */
export function routeIsDescendant(route: RouteObject): boolean {
  return !!(!route.children && route.element && route.path?.endsWith('/*'));
}

function sendIndexPath(pathBuilder: string, pathname: string, basename: string): [string, TransactionSource] {
  const reconstructedPath = pathBuilder || _stripBasename ? stripBasenameFromPathname(pathname, basename) : pathname;

  if (reconstructedPath === '/') {
    // return ['/', 'route'];
  }

  console.log('reconstructedPath for index route:', reconstructedPath);

  const formattedPath =
    // If the path ends with a slash, remove it
    reconstructedPath[reconstructedPath.length - 1] === '/'
      ? reconstructedPath.slice(0, -1)
      : // If the path ends with a wildcard, remove it
        reconstructedPath.slice(-2) === '/*'
        ? reconstructedPath.slice(0, -1)
        : reconstructedPath;

  console.log('formattedPath for index route:', formattedPath);

  return [formattedPath, 'route'];
}

/**
 * Returns the number of URL segments in the given URL string.
 * Splits at '/' or '\/' to handle regex URLs correctly.
 *
 * @param url - The URL string to segment.
 * @returns The number of segments in the URL.
 */
export function getNumberOfUrlSegments(url: string): number {
  // split at '/' or at '\/' to split regex urls correctly
  return url.split(/\\?\//).filter(s => s.length > 0 && s !== ',').length;
}

/**
 * Strip the basename from a pathname if exists.
 *
 * Vendored and modified from `react-router`
 * https://github.com/remix-run/react-router/blob/462bb712156a3f739d6139a0f14810b76b002df6/packages/router/utils.ts#L1038
 */
function stripBasenameFromPathname(pathname: string, basename: string): string {
  if (!basename || basename === '/') {
    return pathname;
  }

  if (!pathname.toLowerCase().startsWith(basename.toLowerCase())) {
    return pathname;
  }

  // We want to leave trailing slash behavior in the user's control, so if they
  // specify a basename with a trailing slash, we should support it
  const startIndex = basename.endsWith('/') ? basename.length - 1 : basename.length;
  const nextChar = pathname.charAt(startIndex);
  if (nextChar && nextChar !== '/') {
    // pathname does not start with basename/
    return pathname;
  }

  return pathname.slice(startIndex) || '/';
}

// Exported utility functions

/**
 * Ensures a path string starts with a forward slash.
 */
export function prefixWithSlash(path: string): string {
  return path[0] === '/' ? path : `/${path}`;
}

/**
 * Rebuilds the route path from all available routes by matching against the current location.
 */
export function rebuildRoutePathFromAllRoutes(allRoutes: RouteObject[], location: Location): string {
  const matchedRoutes = _matchRoutes(allRoutes, location) as RouteMatch[];

  console.log('rebuildRoutePathFromAllRoutes matched: ', location, JSON.stringify(matchedRoutes));

  if (!matchedRoutes || matchedRoutes.length === 0) {
    return '';
  }

  // fixme: this maybe has a bug

  for (const match of matchedRoutes) {
    if (match.route.path && match.route.path !== '*') {
      const path = pickPath(match);
      const strippedPath = stripBasenameFromPathname(location.pathname, prefixWithSlash(match.pathnameBase));

      if (location.pathname === strippedPath) {
        return trimSlash(strippedPath);
      }

      return trimSlash(
        trimSlash(path || '') +
          prefixWithSlash(
            rebuildRoutePathFromAllRoutes(
              allRoutes.filter(route => route !== match.route),
              {
                pathname: strippedPath,
              },
            ),
          ),
      );
    }
  }

  return '';
}

/**
 * Checks if the current location is inside a descendant route (route with splat parameter).
 */
export function locationIsInsideDescendantRoute(location: Location, routes: RouteObject[]): boolean {
  const matchedRoutes = _matchRoutes(routes, location) as RouteMatch[];

  if (matchedRoutes) {
    for (const match of matchedRoutes) {
      if (routeIsDescendant(match.route) && pickSplat(match)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Gets a normalized route name and transaction source from the current routes and location.
 */
export function getNormalizedName(
  routes: RouteObject[],
  location: Location,
  branches: RouteMatch[],
  basename: string = '',
): [string, TransactionSource] {
  if (!routes || routes.length === 0) {
    return [_stripBasename ? stripBasenameFromPathname(location.pathname, basename) : location.pathname, 'url'];
  }

  let pathBuilder = '';

  // console.log('branches:: ', JSON.stringify(branches, null, 2));

  if (branches) {
    for (const branch of branches) {
      const route = branch.route;
      console.log('branch.route', JSON.stringify(branch.route, null, 2));
      if (route) {
        // Early return if index route
        if (route.index) {
          console.log('index route', pathBuilder, branch.pathname, basename);
          return sendIndexPath(pathBuilder, branch.pathname, basename);
        }
        const path = route.path;

        // If path is not a wildcard and has no child routes, append the path
        if (path && !pathIsWildcardAndHasChildren(path, branch)) {
          const newPath = path[0] === '/' || pathBuilder[pathBuilder.length - 1] === '/' ? path : `/${path}`;
          pathBuilder = trimSlash(pathBuilder) + prefixWithSlash(newPath);

          // If the path matches the current location, return the path
          if (trimSlash(location.pathname) === trimSlash(basename + branch.pathname)) {
            if (
              // If the route defined on the element is something like
              // <Route path="/stores/:storeId/products/:productId" element={<div>Product</div>} />
              // We should check against the branch.pathname for the number of / separators
              getNumberOfUrlSegments(pathBuilder) !== getNumberOfUrlSegments(branch.pathname) &&
              // We should not count wildcard operators in the url segments calculation
              !pathEndsWithWildcard(pathBuilder)
            ) {
              return [(_stripBasename ? '' : basename) + newPath, 'route'];
            }

            // if the last character of the pathbuilder is a wildcard and there are children, remove the wildcard
            if (pathIsWildcardAndHasChildren(pathBuilder, branch)) {
              pathBuilder = pathBuilder.slice(0, -1);
            }

            return [(_stripBasename ? '' : basename) + pathBuilder, 'route'];
          }
        }
      }
    }
  }

  const fallbackTransactionName = _stripBasename
    ? stripBasenameFromPathname(location.pathname, basename)
    : location.pathname || '';

  return [fallbackTransactionName, 'url'];
}

/**
 * Shared helper function to resolve route name and source
 */
export function resolveRouteNameAndSource(
  location: Location,
  routes: RouteObject[],
  allRoutes: RouteObject[],
  branches: RouteMatch[],
  basename: string = '',
): [string, TransactionSource] {
  let name: string | undefined;
  let source: TransactionSource = 'url';

  const isInDescendantRoute = locationIsInsideDescendantRoute(location, allRoutes);

  if (isInDescendantRoute) {
    name = prefixWithSlash(rebuildRoutePathFromAllRoutes(allRoutes, location));
    source = 'route';
  }

  if (!isInDescendantRoute || !name) {
    [name, source] = getNormalizedName(routes, location, branches, basename);
  }

  return [name || location.pathname, source];
}
