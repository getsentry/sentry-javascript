/* eslint-disable max-lines */
// Inspired from Donnie McNeal's solution:
// https://gist.github.com/wontondon/e8c4bdf2888875e4c755712e99279536

import {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
  WINDOW,
} from '@sentry/browser';
import type { Client, Integration, Span, TransactionSource } from '@sentry/core';
import {
  addNonEnumerableProperty,
  debug,
  getActiveSpan,
  getClient,
  getCurrentScope,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  spanToJSON,
} from '@sentry/core';
import * as React from 'react';
import { DEBUG_BUILD } from './debug-build';
import { hoistNonReactStatics } from './hoist-non-react-statics';
import { checkRouteForAsyncHandler, updateNavigationSpanWithLazyRoutes } from './lazy-route-utils';
import {
  initializeRouterUtils,
} from './reactrouterv6-utils';
import type {
  Action,
  AgnosticDataRouteMatch,
  CreateRouterFunction,
  CreateRoutesFromChildren,
  Location,
  MatchRoutes,
  RouteMatch,
  RouteObject,
  Router,
  RouterState,
  UseEffect,
  UseLocation,
  UseNavigationType,
  UseRoutes,
} from './types';

let _useEffect: UseEffect;
let _useLocation: UseLocation;
let _useNavigationType: UseNavigationType;
let _createRoutesFromChildren: CreateRoutesFromChildren;
let _matchRoutes: MatchRoutes;
let _stripBasename: boolean = false;
let _enableAsyncRouteHandlers: boolean = false;

const CLIENTS_WITH_INSTRUMENT_NAVIGATION = new WeakSet<Client>();

/**
 * Gets the current location from the window object in browser environments.
 * Returns undefined if window is not available.
 */
function getGlobalLocation(): Location | undefined {
  if (typeof WINDOW !== 'undefined') {
    const globalLocation = WINDOW.location;
    if (globalLocation) {
      return { pathname: globalLocation.pathname };
    }
  }
  return undefined;
}

/**
 * Gets the pathname from the window object in browser environments.
 * Returns undefined if window is not available.
 */
function getGlobalPathname(): string | undefined {
  if (typeof WINDOW !== 'undefined') {
    return WINDOW.location?.pathname;
  }
  return undefined;
}

export interface ReactRouterOptions {
  useEffect: UseEffect;
  useLocation: UseLocation;
  useNavigationType: UseNavigationType;
  createRoutesFromChildren: CreateRoutesFromChildren;
  matchRoutes: MatchRoutes;
  /**
   * Whether to strip the basename from the pathname when creating transactions.
   *
   * This is useful for applications that use a basename in their routing setup.
   * @default false
   */
  stripBasename?: boolean;
  /**
   * Enables support for async route handlers.
   *
   * This allows Sentry to track and instrument routes dynamically resolved from async handlers.
   * @default false
   */
  enableAsyncRouteHandlers?: boolean;
}

type V6CompatibleVersion = '6' | '7';

// Keeping as a global variable for cross-usage in multiple functions
const allRoutes = new Set<RouteObject>();

/**
 * Processes resolved routes by adding them to allRoutes and checking for nested async handlers.
 */
function processResolvedRoutes(
  resolvedRoutes: RouteObject[],
  parentRoute?: RouteObject,
  currentLocation?: Location,
): void {
  resolvedRoutes.forEach(child => {
    allRoutes.add(child);
    // Only check for async handlers if the feature is enabled
    if (_enableAsyncRouteHandlers) {
      checkRouteForAsyncHandler(child, processResolvedRoutes);
    }
  });

  if (parentRoute) {
    // If a parent route is provided, add the resolved routes as children to the parent route
    addResolvedRoutesToParent(resolvedRoutes, parentRoute);
  }

  // After processing lazy routes, check if we need to update an active transaction
  const activeRootSpan = getActiveRootSpan();
  if (activeRootSpan) {
    const spanOp = spanToJSON(activeRootSpan).op;

    // Try to use the provided location first, then fall back to global window location if needed
    let location = currentLocation;
    if (!location) {
      location = getGlobalLocation();
    }

    if (location) {
      if (spanOp === 'pageload') {
        // Re-run the pageload transaction update with the newly loaded routes
        updatePageloadTransaction(
          activeRootSpan,
          { pathname: location.pathname },
          Array.from(allRoutes),
          undefined,
          undefined,
          Array.from(allRoutes),
        );
      } else if (spanOp === 'navigation') {
        // For navigation spans, update the name with the newly loaded routes
        updateNavigationSpanWithLazyRoutes(
          activeRootSpan,
          location,
          Array.from(allRoutes),
          false,
          _matchRoutes,
        );
      }
    }
  }
}

function wrapPatchRoutesOnNavigation(
  opts: Record<string, unknown> | undefined,
  isMemoryRouter = false,
): Record<string, unknown> {
  if (!opts || !('patchRoutesOnNavigation' in opts) || typeof opts.patchRoutesOnNavigation !== 'function') {
    return opts || {};
  }

  const originalPatchRoutes = opts.patchRoutesOnNavigation;
  return {
    ...opts,
    patchRoutesOnNavigation: async (args: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      const targetPath = (args as any)?.path;

      // For browser router, wrap the patch function to update span during patching
      if (!isMemoryRouter) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        const originalPatch = (args as any)?.patch;
        if (originalPatch) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          (args as any).patch = (routeId: string, children: RouteObject[]) => {
            addRoutesToAllRoutes(children);
            const activeRootSpan = getActiveRootSpan();
            if (activeRootSpan && (spanToJSON(activeRootSpan) as { op?: string }).op === 'navigation') {
              updateNavigationSpanWithLazyRoutes(
                activeRootSpan,
                {
                  pathname: targetPath,
                  search: '',
                  hash: '',
                  state: null,
                  key: 'default',
                },
                Array.from(allRoutes),
                true,
                _matchRoutes,
              );
            }
            return originalPatch(routeId, children);
          };
        }
      }

      const result = await originalPatchRoutes(args);

      // Update navigation span after routes are patched
      const activeRootSpan = getActiveRootSpan();
      if (activeRootSpan && (spanToJSON(activeRootSpan) as { op?: string }).op === 'navigation') {
        // For memory routers, we don't have a reliable way to get the current pathname
        // without accessing window.location, so we'll use targetPath for both cases
        const pathname = targetPath || (isMemoryRouter ? getGlobalPathname() : undefined);
        if (pathname) {
          updateNavigationSpanWithLazyRoutes(
            activeRootSpan,
            {
              pathname,
              search: '',
              hash: '',
              state: null,
              key: 'default',
            },
            Array.from(allRoutes),
            false,
            _matchRoutes,
          );
        }
      }

      return result;
    },
  };
}

/**
 * Creates a wrapCreateBrowserRouter function that can be used with all React Router v6 compatible versions.
 */
export function createV6CompatibleWrapCreateBrowserRouter<
  TState extends RouterState = RouterState,
  TRouter extends Router<TState> = Router<TState>,
>(
  createRouterFunction: CreateRouterFunction<TState, TRouter>,
  version: V6CompatibleVersion,
): CreateRouterFunction<TState, TRouter> {
  if (!_useEffect || !_useLocation || !_useNavigationType || !_matchRoutes) {
    DEBUG_BUILD &&
      debug.warn(
        `reactRouterV${version}Instrumentation was unable to wrap the \`createRouter\` function because of one or more missing parameters.`,
      );

    return createRouterFunction;
  }

  return function (routes: RouteObject[], opts?: Record<string, unknown> & { basename?: string }): TRouter {
    addRoutesToAllRoutes(routes);

    // Check for async handlers that might contain sub-route declarations (only if enabled)
    if (_enableAsyncRouteHandlers) {
      for (const route of routes) {
        checkRouteForAsyncHandler(route, processResolvedRoutes);
      }
    }

    // Wrap patchRoutesOnNavigation to detect when lazy routes are loaded
    const wrappedOpts = wrapPatchRoutesOnNavigation(opts);

    const router = createRouterFunction(routes, wrappedOpts);
    const basename = opts?.basename;

    const activeRootSpan = getActiveRootSpan();

    // The initial load ends when `createBrowserRouter` is called.
    // This is the earliest convenient time to update the transaction name.
    // Callbacks to `router.subscribe` are not called for the initial load.
    if (router.state.historyAction === 'POP' && activeRootSpan) {
      updatePageloadTransaction(
        activeRootSpan,
        router.state.location,
        routes,
        undefined,
        basename,
        Array.from(allRoutes),
      );
    }

    router.subscribe((state: RouterState) => {
      if (state.historyAction === 'PUSH' || state.historyAction === 'POP') {
        // Wait for the next render if loading an unsettled route
        if (state.navigation.state !== 'idle') {
          requestAnimationFrame(() => {
            handleNavigation({
              location: state.location,
              routes,
              navigationType: state.historyAction,
              version,
              basename,
              allRoutes: Array.from(allRoutes),
            });
          });
        } else {
          handleNavigation({
            location: state.location,
            routes,
            navigationType: state.historyAction,
            version,
            basename,
            allRoutes: Array.from(allRoutes),
          });
        }
      }
    });

    return router;
  };
}

/**
 * Creates a wrapCreateMemoryRouter function that can be used with all React Router v6 compatible versions.
 */
export function createV6CompatibleWrapCreateMemoryRouter<
  TState extends RouterState = RouterState,
  TRouter extends Router<TState> = Router<TState>,
>(
  createRouterFunction: CreateRouterFunction<TState, TRouter>,
  version: V6CompatibleVersion,
): CreateRouterFunction<TState, TRouter> {
  if (!_useEffect || !_useLocation || !_useNavigationType || !_matchRoutes) {
    DEBUG_BUILD &&
      debug.warn(
        `reactRouterV${version}Instrumentation was unable to wrap the \`createMemoryRouter\` function because of one or more missing parameters.`,
      );

    return createRouterFunction;
  }

  return function (
    routes: RouteObject[],
    opts?: Record<string, unknown> & {
      basename?: string;
      initialEntries?: (string | { pathname: string })[];
      initialIndex?: number;
    },
  ): TRouter {
    addRoutesToAllRoutes(routes);

    // Check for async handlers that might contain sub-route declarations (only if enabled)
    if (_enableAsyncRouteHandlers) {
      for (const route of routes) {
        checkRouteForAsyncHandler(route, processResolvedRoutes);
      }
    }

    // Wrap patchRoutesOnNavigation to detect when lazy routes are loaded
    const wrappedOpts = wrapPatchRoutesOnNavigation(opts, true);

    const router = createRouterFunction(routes, wrappedOpts);
    const basename = opts?.basename;

    const activeRootSpan = getActiveRootSpan();
    let initialEntry = undefined;

    const initialEntries = opts?.initialEntries;
    const initialIndex = opts?.initialIndex;

    const hasOnlyOneInitialEntry = initialEntries && initialEntries.length === 1;
    const hasIndexedEntry = initialIndex !== undefined && initialEntries && initialEntries[initialIndex];

    initialEntry = hasOnlyOneInitialEntry
      ? initialEntries[0]
      : hasIndexedEntry
        ? initialEntries[initialIndex]
        : undefined;

    const location = initialEntry
      ? typeof initialEntry === 'string'
        ? { pathname: initialEntry }
        : initialEntry
      : router.state.location;

    if (router.state.historyAction === 'POP' && activeRootSpan) {
      updatePageloadTransaction(activeRootSpan, location, routes, undefined, basename, Array.from(allRoutes));
    }

    router.subscribe((state: RouterState) => {
      const location = state.location;
      if (state.historyAction === 'PUSH' || state.historyAction === 'POP') {
        handleNavigation({
          location,
          routes,
          navigationType: state.historyAction,
          version,
          basename,
          allRoutes: Array.from(allRoutes),
        });
      }
    });

    return router;
  };
}

/**
 * Creates a browser tracing integration that can be used with all React Router v6 compatible versions.
 */
export function createReactRouterV6CompatibleTracingIntegration(
  options: Parameters<typeof browserTracingIntegration>[0] & ReactRouterOptions,
  version: V6CompatibleVersion,
): Integration {
  const integration = browserTracingIntegration({
    ...options,
    instrumentPageLoad: false,
    instrumentNavigation: false,
  });

  const {
    useEffect,
    useLocation,
    useNavigationType,
    createRoutesFromChildren,
    matchRoutes,
    stripBasename,
    enableAsyncRouteHandlers = false,
    instrumentPageLoad = true,
    instrumentNavigation = true,
  } = options;

  return {
    ...integration,
    setup(client) {
      integration.setup(client);

      _useEffect = useEffect;
      _useLocation = useLocation;
      _useNavigationType = useNavigationType;
      _matchRoutes = matchRoutes;
      _createRoutesFromChildren = createRoutesFromChildren;
      _stripBasename = stripBasename || false;
      _enableAsyncRouteHandlers = enableAsyncRouteHandlers;

      // Initialize the router utils with the required dependencies
      initializeRouterUtils(matchRoutes, stripBasename || false);
    },
    afterAllSetup(client) {
      integration.afterAllSetup(client);

      const initPathName = getGlobalPathname();
      if (instrumentPageLoad && initPathName) {
        startBrowserTracingPageLoadSpan(client, {
          name: initPathName,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: `auto.pageload.react.reactrouter_v${version}`,
          },
        });
      }

      if (instrumentNavigation) {
        CLIENTS_WITH_INSTRUMENT_NAVIGATION.add(client);
      }
    },
  };
}

export function createV6CompatibleWrapUseRoutes(origUseRoutes: UseRoutes, version: V6CompatibleVersion): UseRoutes {
  if (!_useEffect || !_useLocation || !_useNavigationType || !_matchRoutes) {
    DEBUG_BUILD &&
      debug.warn(
        'reactRouterV6Instrumentation was unable to wrap `useRoutes` because of one or more missing parameters.',
      );

    return origUseRoutes;
  }

  const SentryRoutes: React.FC<{
    children?: React.ReactNode;
    routes: RouteObject[];
    locationArg?: Partial<Location> | string;
  }> = (props: { children?: React.ReactNode; routes: RouteObject[]; locationArg?: Partial<Location> | string }) => {
    const isMountRenderPass = React.useRef(true);
    const { routes, locationArg } = props;

    const Routes = origUseRoutes(routes, locationArg);

    const location = _useLocation();
    const navigationType = _useNavigationType();

    // A value with stable identity to either pick `locationArg` if available or `location` if not
    const stableLocationParam =
      typeof locationArg === 'string' || locationArg?.pathname ? (locationArg as { pathname: string }) : location;

    _useEffect(() => {
      const normalizedLocation =
        typeof stableLocationParam === 'string' ? { pathname: stableLocationParam } : stableLocationParam;

      if (isMountRenderPass.current) {
        addRoutesToAllRoutes(routes);

        updatePageloadTransaction(
          getActiveRootSpan(),
          normalizedLocation,
          routes,
          undefined,
          undefined,
          Array.from(allRoutes),
        );
        isMountRenderPass.current = false;
      } else {
        handleNavigation({
          location: normalizedLocation,
          routes,
          navigationType,
          version,
          allRoutes: Array.from(allRoutes),
        });
      }
    }, [navigationType, stableLocationParam]);

    return Routes;
  };

  // eslint-disable-next-line react/display-name
  return (routes: RouteObject[], locationArg?: Partial<Location> | string): React.ReactElement | null => {
    return <SentryRoutes routes={routes} locationArg={locationArg} />;
  };
}

export function handleNavigation(opts: {
  location: Location;
  routes: RouteObject[];
  navigationType: Action;
  version: V6CompatibleVersion;
  matches?: AgnosticDataRouteMatch;
  basename?: string;
  allRoutes?: RouteObject[];
}): void {
  const { location, routes, navigationType, version, matches, basename, allRoutes } = opts;
  const branches = Array.isArray(matches) ? matches : _matchRoutes(routes, location, basename);

  const client = getClient();
  if (!client || !CLIENTS_WITH_INSTRUMENT_NAVIGATION.has(client)) {
    return;
  }

  if ((navigationType === 'PUSH' || navigationType === 'POP') && branches) {
    const [name, source] = resolveRouteNameAndSource(
      location,
      routes,
      allRoutes || routes,
      branches as RouteMatch[],
      basename,
    );

    const activeSpan = getActiveSpan();
    const spanJson = activeSpan && spanToJSON(activeSpan);
    const isAlreadyInNavigationSpan = spanJson?.op === 'navigation';

    // Cross usage can result in multiple navigation spans being created without this check
    if (isAlreadyInNavigationSpan && activeSpan && spanJson) {
      handleExistingNavigationSpan(activeSpan, spanJson, name, source, false);
    } else {
      createNewNavigationSpan(client, name, source, version, false);
    }
  }
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

function sendIndexPath(pathBuilder: string, pathname: string, basename: string): [string, TransactionSource] {
  const reconstructedPath = pathBuilder || _stripBasename ? stripBasenameFromPathname(pathname, basename) : pathname;

  const formattedPath =
    // If the path ends with a slash, remove it
    reconstructedPath[reconstructedPath.length - 1] === '/'
      ? reconstructedPath.slice(0, -1)
      : // If the path ends with a wildcard, remove it
        reconstructedPath.slice(-2) === '/*'
        ? reconstructedPath.slice(0, -1)
        : reconstructedPath;

  return [formattedPath, 'route'];
}

function pathEndsWithWildcard(path: string): boolean {
  return path.endsWith('*');
}

function pathIsWildcardAndHasChildren(path: string, branch: RouteMatch<string>): boolean {
  return (pathEndsWithWildcard(path) && !!branch.route.children?.length) || false;
}

function routeIsDescendant(route: RouteObject): boolean {
  return !!(!route.children && route.element && route.path?.endsWith('/*'));
}

function locationIsInsideDescendantRoute(location: Location, routes: RouteObject[]): boolean {
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

function addRoutesToAllRoutes(routes: RouteObject[]): void {
  routes.forEach(route => {
    const extractedChildRoutes = getChildRoutesRecursively(route);

    extractedChildRoutes.forEach(r => {
      allRoutes.add(r);
    });
  });
}

function getChildRoutesRecursively(route: RouteObject, allRoutes: Set<RouteObject> = new Set()): Set<RouteObject> {
  if (!allRoutes.has(route)) {
    allRoutes.add(route);

    if (route.children && !route.index) {
      route.children.forEach(child => {
        const childRoutes = getChildRoutesRecursively(child, allRoutes);

        childRoutes.forEach(r => {
          allRoutes.add(r);
        });
      });
    }
  }

  return allRoutes;
}

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

function prefixWithSlash(path: string): string {
  return path[0] === '/' ? path : `/${path}`;
}

function rebuildRoutePathFromAllRoutes(allRoutes: RouteObject[], location: Location): string {
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

function getNormalizedName(
  routes: RouteObject[],
  location: Location,
  branches: RouteMatch[],
  basename: string = '',
): [string, TransactionSource] {
  if (!routes || routes.length === 0) {
    return [_stripBasename ? stripBasenameFromPathname(location.pathname, basename) : location.pathname, 'url'];
  }

  let pathBuilder = '';

  if (branches) {
    for (const branch of branches) {
      const route = branch.route;
      if (route) {
        // Early return if index route
        if (route.index) {
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
    : location.pathname;

  return [fallbackTransactionName, 'url'];
}

function updatePageloadTransaction(
  activeRootSpan: Span | undefined,
  location: Location,
  routes: RouteObject[],
  matches?: AgnosticDataRouteMatch,
  basename?: string,
  allRoutes?: RouteObject[],
): void {
  const branches = Array.isArray(matches)
    ? matches
    : (_matchRoutes(allRoutes || routes, location, basename) as unknown as RouteMatch[]);

  if (branches) {
    let name,
      source: TransactionSource = 'url';

    const isInDescendantRoute = locationIsInsideDescendantRoute(location, allRoutes || routes);

    if (isInDescendantRoute) {
      name = prefixWithSlash(rebuildRoutePathFromAllRoutes(allRoutes || routes, location));
      source = 'route';
    }

    if (!isInDescendantRoute || !name) {
      [name, source] = getNormalizedName(routes, location, branches, basename);
    }

    getCurrentScope().setTransactionName(name || '/');

    if (activeRootSpan) {
      activeRootSpan.updateName(name);
      activeRootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createV6CompatibleWithSentryReactRouterRouting<P extends Record<string, any>, R extends React.FC<P>>(
  Routes: R,
  version: V6CompatibleVersion,
): R {
  if (!_useEffect || !_useLocation || !_useNavigationType || !_createRoutesFromChildren || !_matchRoutes) {
    DEBUG_BUILD &&
      debug.warn(`reactRouterV6Instrumentation was unable to wrap Routes because of one or more missing parameters.
      useEffect: ${_useEffect}. useLocation: ${_useLocation}. useNavigationType: ${_useNavigationType}.
      createRoutesFromChildren: ${_createRoutesFromChildren}. matchRoutes: ${_matchRoutes}.`);

    return Routes;
  }

  const SentryRoutes: React.FC<P> = (props: P) => {
    const isMountRenderPass = React.useRef(true);

    const location = _useLocation();
    const navigationType = _useNavigationType();

    _useEffect(
      () => {
        const routes = _createRoutesFromChildren(props.children) as RouteObject[];

        if (isMountRenderPass.current) {
          addRoutesToAllRoutes(routes);

          updatePageloadTransaction(getActiveRootSpan(), location, routes, undefined, undefined, Array.from(allRoutes));
          isMountRenderPass.current = false;
        } else {
          handleNavigation({
            location,
            routes,
            navigationType,
            version,
            allRoutes: Array.from(allRoutes),
          });
        }
      },
      // `props.children` is purposely not included in the dependency array, because we do not want to re-run this effect
      // when the children change. We only want to start transactions when the location or navigation type change.
      [location, navigationType],
    );

    // @ts-expect-error Setting more specific React Component typing for `R` generic above
    // will break advanced type inference done by react router params
    return <Routes {...props} />;
  };

  hoistNonReactStatics(SentryRoutes, Routes);

  // @ts-expect-error Setting more specific React Component typing for `R` generic above
  // will break advanced type inference done by react router params
  return SentryRoutes;
}

function getActiveRootSpan(): Span | undefined {
  const span = getActiveSpan();
  const rootSpan = span ? getRootSpan(span) : undefined;

  if (!rootSpan) {
    return undefined;
  }

  const op = spanToJSON(rootSpan).op;

  // Only use this root span if it is a pageload or navigation span
  return op === 'navigation' || op === 'pageload' ? rootSpan : undefined;
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
 * Handles updating an existing navigation span
 */
export function handleExistingNavigationSpan(
  activeSpan: Span,
  spanJson: ReturnType<typeof spanToJSON>,
  name: string,
  source: TransactionSource,
  isLikelyLazyRoute: boolean,
): void {
  // Check if we've already set the name for this span using a custom property
  const hasBeenNamed = (
    activeSpan as {
      __sentry_navigation_name_set__?: boolean;
    }
  )?.__sentry_navigation_name_set__;

  if (!hasBeenNamed) {
    // This is the first time we're setting the name for this span
    if (!spanJson.timestamp) {
      activeSpan?.updateName(name);
    }

    // For lazy routes, don't mark as named yet so it can be updated later
    if (!isLikelyLazyRoute) {
      addNonEnumerableProperty(
        activeSpan as { __sentry_navigation_name_set__?: boolean },
        '__sentry_navigation_name_set__',
        true,
      );
    }
  }

  activeSpan?.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source);
}

/**
 * Creates a new navigation span
 */
export function createNewNavigationSpan(
  client: Client,
  name: string,
  source: TransactionSource,
  version: string,
  isLikelyLazyRoute: boolean,
): void {
  const newSpan = startBrowserTracingNavigationSpan(client, {
    name,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: `auto.navigation.react.reactrouter_v${version}`,
    },
  });

  // For lazy routes, don't mark as named yet so it can be updated later when the route loads
  if (!isLikelyLazyRoute && newSpan) {
    addNonEnumerableProperty(
      newSpan as { __sentry_navigation_name_set__?: boolean },
      '__sentry_navigation_name_set__',
      true,
    );
  }
}

/**
 * Adds resolved routes as children to the parent route.
 * Prevents duplicate routes by checking if they already exist.
 */
export function addResolvedRoutesToParent(resolvedRoutes: RouteObject[], parentRoute: RouteObject): void {
  const existingChildren = parentRoute.children || [];

  const newRoutes = resolvedRoutes.filter(
    newRoute =>
      !existingChildren.some(
        existing =>
          existing === newRoute ||
          (newRoute.path && existing.path === newRoute.path) ||
          (newRoute.id && existing.id === newRoute.id),
      ),
  );

  if (newRoutes.length > 0) {
    parentRoute.children = [...existingChildren, ...newRoutes];
  }
}

/**
 * Returns number of URL segments of a passed string URL.
 */
export function getNumberOfUrlSegments(url: string): number {
  // split at '/' or at '\/' to split regex urls correctly
  return url.split(/\\?\//).filter(s => s.length > 0 && s !== ',').length;
}
