import type { Span, TransactionSource } from '@sentry/core';
import { debug, getActiveSpan, getRootSpan, spanToJSON } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import type { Location, MatchRoutes, RouteMatch, RouteObject } from '../types';

// Global variables that these utilities depend on
let _matchRoutes: MatchRoutes;
let _stripBasename: boolean = false;

// Navigation context stack for nested/concurrent patchRoutesOnNavigation calls.
// Required because window.location hasn't updated yet when handlers are invoked.
interface NavigationContext {
  token: object;
  targetPath: string | undefined;
  span: Span | undefined;
}

const _navigationContextStack: NavigationContext[] = [];
const MAX_CONTEXT_STACK_SIZE = 10;

/**
 * Pushes a navigation context and returns a unique token for cleanup.
 * The token uses object identity for uniqueness (no counter needed).
 */
export function setNavigationContext(targetPath: string | undefined, span: Span | undefined): object {
  const token = {};
  // Prevent unbounded stack growth - oldest (likely stale) contexts are evicted first
  if (_navigationContextStack.length >= MAX_CONTEXT_STACK_SIZE) {
    DEBUG_BUILD && debug.warn('[React Router] Navigation context stack overflow - removing oldest context');
    _navigationContextStack.shift();
  }
  _navigationContextStack.push({ token, targetPath, span });
  return token;
}

/**
 * Clears the navigation context if it's on top of the stack (LIFO).
 * If our context is not on top (out-of-order completion), we leave it -
 * it will be cleaned up by overflow protection when the stack fills up.
 */
export function clearNavigationContext(token: object): void {
  const top = _navigationContextStack[_navigationContextStack.length - 1];
  if (top?.token === token) {
    _navigationContextStack.pop();
  }
}

/** Gets the current (most recent) navigation context if inside a patchRoutesOnNavigation call. */
export function getNavigationContext(): NavigationContext | null {
  const length = _navigationContextStack.length;
  // The `?? null` converts undefined (from array access) to null to match return type
  return length > 0 ? (_navigationContextStack[length - 1] ?? null) : null;
}

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

/** Checks if transaction name has wildcard (/* or ends with *). */
export function transactionNameHasWildcard(name: string): boolean {
  return name.includes('/*') || name.endsWith('*');
}

/**
 * Checks if a path is a wildcard and has child routes.
 */
export function pathIsWildcardAndHasChildren(path: string, branch: RouteMatch<string>): boolean {
  return (pathEndsWithWildcard(path) && !!branch.route.children?.length) || false;
}

/** Check if route is in descendant route (<Routes> within <Routes>) */
export function routeIsDescendant(route: RouteObject): boolean {
  return !!(!route.children && route.element && route.path?.endsWith('/*'));
}

function sendIndexPath(pathBuilder: string, pathname: string, basename: string): [string, TransactionSource] {
  const reconstructedPath =
    pathBuilder && pathBuilder.length > 0
      ? pathBuilder
      : _stripBasename
        ? stripBasenameFromPathname(pathname, basename)
        : pathname;

  let formattedPath =
    // If the path ends with a wildcard suffix, remove both the slash and the asterisk
    reconstructedPath.slice(-2) === '/*' ? reconstructedPath.slice(0, -2) : reconstructedPath;

  // If the path ends with a slash, remove it (but keep single '/')
  if (formattedPath.length > 1 && formattedPath[formattedPath.length - 1] === '/') {
    formattedPath = formattedPath.slice(0, -1);
  }

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

  if (!matchedRoutes || matchedRoutes.length === 0) {
    return '';
  }

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
 * Returns a fallback transaction name from location pathname.
 */
function getFallbackTransactionName(location: Location, basename: string): string {
  return _stripBasename ? stripBasenameFromPathname(location.pathname, basename) : location.pathname || '';
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

  if (!branches) {
    return [getFallbackTransactionName(location, basename), 'url'];
  }

  let pathBuilder = '';

  for (const branch of branches) {
    const route = branch.route;
    if (!route) {
      continue;
    }

    // Early return for index routes
    if (route.index) {
      return sendIndexPath(pathBuilder, branch.pathname, basename);
    }

    const path = route.path;
    if (!path || pathIsWildcardAndHasChildren(path, branch)) {
      continue;
    }

    // Build the route path
    const newPath = path[0] === '/' || pathBuilder[pathBuilder.length - 1] === '/' ? path : `/${path}`;
    pathBuilder = trimSlash(pathBuilder) + prefixWithSlash(newPath);

    // Check if this path matches the current location
    if (trimSlash(location.pathname) !== trimSlash(basename + branch.pathname)) {
      continue;
    }

    // Check if this is a parameterized route like /stores/:storeId/products/:productId
    if (
      getNumberOfUrlSegments(pathBuilder) !== getNumberOfUrlSegments(branch.pathname) &&
      !pathEndsWithWildcard(pathBuilder)
    ) {
      return [(_stripBasename ? '' : basename) + newPath, 'route'];
    }

    // Handle wildcard routes with children - strip trailing wildcard
    if (pathIsWildcardAndHasChildren(pathBuilder, branch)) {
      pathBuilder = pathBuilder.slice(0, -1);
    }

    return [(_stripBasename ? '' : basename) + pathBuilder, 'route'];
  }

  // Fallback when no matching route found
  return [getFallbackTransactionName(location, basename), 'url'];
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

/**
 * Gets the active root span if it's a pageload or navigation span.
 */
export function getActiveRootSpan(): Span | undefined {
  const span = getActiveSpan();
  const rootSpan = span ? getRootSpan(span) : undefined;

  if (!rootSpan) {
    return undefined;
  }

  const op = spanToJSON(rootSpan).op;

  // Only use this root span if it is a pageload or navigation span
  return op === 'navigation' || op === 'pageload' ? rootSpan : undefined;
}
