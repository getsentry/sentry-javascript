/* eslint-disable max-lines */
// Inspired from Donnie McNeal's solution:
// https://gist.github.com/wontondon/e8c4bdf2888875e4c755712e99279536

import {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
  WINDOW,
} from '@sentry/browser';
import type { Client, Integration, Span } from '@sentry/core';
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
import { DEBUG_BUILD } from '../debug-build';
import { hoistNonReactStatics } from '../hoist-non-react-statics';
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
} from '../types';
import { checkRouteForAsyncHandler } from './lazy-routes';
import { initializeRouterUtils, resolveRouteNameAndSource } from './utils';

let _useEffect: UseEffect;
let _useLocation: UseLocation;
let _useNavigationType: UseNavigationType;
let _createRoutesFromChildren: CreateRoutesFromChildren;
let _matchRoutes: MatchRoutes;
let _enableAsyncRouteHandlers: boolean = false;

const CLIENTS_WITH_INSTRUMENT_NAVIGATION = new WeakSet<Client>();

/**
 * Tracks last navigation per client to prevent duplicate spans in cross-usage scenarios.
 * Entry persists until next different navigation, handling delayed wrapper execution.
 */
const LAST_NAVIGATION_PER_CLIENT = new WeakMap<Client, string>();

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
// only exported for testing purposes
export const allRoutes = new Set<RouteObject>();

/**
 * Processes resolved routes by adding them to allRoutes and checking for nested async handlers.
 */
export function processResolvedRoutes(
  resolvedRoutes: RouteObject[],
  parentRoute?: RouteObject,
  currentLocation: Location | null = null,
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
      if (typeof WINDOW !== 'undefined') {
        const globalLocation = WINDOW.location;
        if (globalLocation) {
          location = { pathname: globalLocation.pathname };
        }
      }
    }

    if (location) {
      if (spanOp === 'pageload') {
        // Re-run the pageload transaction update with the newly loaded routes
        updatePageloadTransaction({
          activeRootSpan,
          location: { pathname: location.pathname },
          routes: Array.from(allRoutes),
          allRoutes: Array.from(allRoutes),
        });
      } else if (spanOp === 'navigation') {
        // For navigation spans, update the name with the newly loaded routes
        updateNavigationSpan(activeRootSpan, location, Array.from(allRoutes), false, _matchRoutes);
      }
    }
  }
}

/**
 * Updates a navigation span with the correct route name after lazy routes have been loaded.
 */
export function updateNavigationSpan(
  activeRootSpan: Span,
  location: Location,
  allRoutes: RouteObject[],
  forceUpdate = false,
  matchRoutes: MatchRoutes,
): void {
  // Check if this span has already been named to avoid multiple updates
  // But allow updates if this is a forced update (e.g., when lazy routes are loaded)
  const hasBeenNamed =
    !forceUpdate && (activeRootSpan as { __sentry_navigation_name_set__?: boolean })?.__sentry_navigation_name_set__;

  if (!hasBeenNamed) {
    // Get fresh branches for the current location with all loaded routes
    const currentBranches = matchRoutes(allRoutes, location);
    const [name, source] = resolveRouteNameAndSource(
      location,
      allRoutes,
      allRoutes,
      (currentBranches as RouteMatch[]) || [],
      '',
    );

    // Only update if we have a valid name and the span hasn't finished
    const spanJson = spanToJSON(activeRootSpan);
    if (name && !spanJson.timestamp) {
      activeRootSpan.updateName(name);
      activeRootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source);

      // Mark this span as having its name set to prevent future updates
      addNonEnumerableProperty(
        activeRootSpan as { __sentry_navigation_name_set__?: boolean },
        '__sentry_navigation_name_set__',
        true,
      );
    }
  }
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

    // Track whether we've completed the initial pageload to properly distinguish
    // between POPs that occur during pageload vs. legitimate back/forward navigation.
    let isInitialPageloadComplete = false;
    let hasSeenPageloadSpan = !!activeRootSpan && spanToJSON(activeRootSpan).op === 'pageload';
    let hasSeenPopAfterPageload = false;

    // The initial load ends when `createBrowserRouter` is called.
    // This is the earliest convenient time to update the transaction name.
    // Callbacks to `router.subscribe` are not called for the initial load.
    if (router.state.historyAction === 'POP' && activeRootSpan) {
      updatePageloadTransaction({
        activeRootSpan,
        location: router.state.location,
        routes,
        basename,
        allRoutes: Array.from(allRoutes),
      });
    }

    router.subscribe((state: RouterState) => {
      // Track pageload completion to distinguish POPs during pageload from legitimate back/forward navigation
      if (!isInitialPageloadComplete) {
        const currentRootSpan = getActiveRootSpan();
        const isCurrentlyInPageload = currentRootSpan && spanToJSON(currentRootSpan).op === 'pageload';

        if (isCurrentlyInPageload) {
          hasSeenPageloadSpan = true;
        } else if (hasSeenPageloadSpan) {
          // Pageload span was active but is now gone - pageload has completed
          if (state.historyAction === 'POP' && !hasSeenPopAfterPageload) {
            // Pageload ended: ignore the first POP after pageload
            hasSeenPopAfterPageload = true;
          } else {
            // Pageload ended: either non-POP action or subsequent POP
            isInitialPageloadComplete = true;
          }
        }
        // If we haven't seen a pageload span yet, keep waiting (don't mark as complete)
      }

      // Only handle navigation when it's complete (state is idle).
      // During 'loading' or 'submitting', state.location may still have the old pathname,
      // which would cause us to create a span for the wrong route.
      const shouldHandleNavigation =
        (state.historyAction === 'PUSH' || (state.historyAction === 'POP' && isInitialPageloadComplete)) &&
        state.navigation.state === 'idle';

      if (shouldHandleNavigation) {
        handleNavigation({
          location: state.location,
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

    const memoryActiveRootSpan = getActiveRootSpan();

    if (router.state.historyAction === 'POP' && memoryActiveRootSpan) {
      updatePageloadTransaction({
        activeRootSpan: memoryActiveRootSpan,
        location,
        routes,
        basename,
        allRoutes: Array.from(allRoutes),
      });
    }

    // Track whether we've completed the initial pageload to properly distinguish
    // between POPs that occur during pageload vs. legitimate back/forward navigation.
    let isInitialPageloadComplete = false;
    let hasSeenPageloadSpan = !!memoryActiveRootSpan && spanToJSON(memoryActiveRootSpan).op === 'pageload';
    let hasSeenPopAfterPageload = false;

    router.subscribe((state: RouterState) => {
      // Track pageload completion to distinguish POPs during pageload from legitimate back/forward navigation
      if (!isInitialPageloadComplete) {
        const currentRootSpan = getActiveRootSpan();
        const isCurrentlyInPageload = currentRootSpan && spanToJSON(currentRootSpan).op === 'pageload';

        if (isCurrentlyInPageload) {
          hasSeenPageloadSpan = true;
        } else if (hasSeenPageloadSpan) {
          // Pageload span was active but is now gone - pageload has completed
          if (state.historyAction === 'POP' && !hasSeenPopAfterPageload) {
            // Pageload ended: ignore the first POP after pageload
            hasSeenPopAfterPageload = true;
          } else {
            // Pageload ended: either non-POP action or subsequent POP
            isInitialPageloadComplete = true;
          }
        }
        // If we haven't seen a pageload span yet, keep waiting (don't mark as complete)
      }

      // Only handle navigation when it's complete (state is idle).
      // During 'loading' or 'submitting', state.location may still have the old pathname,
      // which would cause us to create a span for the wrong route.
      const shouldHandleNavigation =
        (state.historyAction === 'PUSH' || (state.historyAction === 'POP' && isInitialPageloadComplete)) &&
        state.navigation.state === 'idle';

      if (shouldHandleNavigation) {
        handleNavigation({
          location: state.location,
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
  const integration = browserTracingIntegration({ ...options, instrumentPageLoad: false, instrumentNavigation: false });

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
      _enableAsyncRouteHandlers = enableAsyncRouteHandlers;

      // Initialize the router utils with the required dependencies
      initializeRouterUtils(matchRoutes, stripBasename || false);
    },
    afterAllSetup(client) {
      integration.afterAllSetup(client);

      const initPathName = WINDOW.location?.pathname;
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

        updatePageloadTransaction({
          activeRootSpan: getActiveRootSpan(),
          location: normalizedLocation,
          routes,
          allRoutes: Array.from(allRoutes),
        });
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
              updateNavigationSpan(
                activeRootSpan,
                { pathname: targetPath, search: '', hash: '', state: null, key: 'default' },
                Array.from(allRoutes),
                true, // forceUpdate = true since we're loading lazy routes
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
        // Determine pathname based on router type
        let pathname: string | undefined;
        if (isMemoryRouter) {
          // For memory routers, only use targetPath
          pathname = targetPath;
        } else {
          // For browser routers, use targetPath or fall back to window.location
          pathname = targetPath || WINDOW.location?.pathname;
        }

        if (pathname) {
          updateNavigationSpan(
            activeRootSpan,
            { pathname, search: '', hash: '', state: null, key: 'default' },
            Array.from(allRoutes),
            false, // forceUpdate = false since this is after lazy routes are loaded
            _matchRoutes,
          );
        }
      }

      return result;
    },
  };
}

function getNavigationKey(location: Location): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

function tryUpdateSpanName(
  activeSpan: Span,
  currentSpanName: string | undefined,
  newName: string,
  newSource: string,
): void {
  const isNewNameBetter = newName !== currentSpanName && newName.includes(':');
  if (isNewNameBetter) {
    activeSpan.updateName(newName);
    activeSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, newSource as 'route' | 'url' | 'custom');
  }
}

function isDuplicateNavigation(client: Client, navigationKey: string): boolean {
  const lastKey = LAST_NAVIGATION_PER_CLIENT.get(client);
  return lastKey === navigationKey;
}

function createNavigationSpan(opts: {
  client: Client;
  name: string;
  source: string;
  version: string;
  location: Location;
  routes: RouteObject[];
  basename?: string;
  allRoutes?: RouteObject[];
  navigationKey: string;
}): Span | undefined {
  const { client, name, source, version, location, routes, basename, allRoutes, navigationKey } = opts;

  const navigationSpan = startBrowserTracingNavigationSpan(client, {
    name,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source as 'route' | 'url' | 'custom',
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: `auto.navigation.react.reactrouter_v${version}`,
    },
  });

  if (navigationSpan) {
    LAST_NAVIGATION_PER_CLIENT.set(client, navigationKey);
    patchNavigationSpanEnd(navigationSpan, location, routes, basename, allRoutes);

    const unsubscribe = client.on('spanEnd', endedSpan => {
      if (endedSpan === navigationSpan) {
        // Clear key only if it's still our key (handles overlapping navigations)
        const lastKey = LAST_NAVIGATION_PER_CLIENT.get(client);
        if (lastKey === navigationKey) {
          LAST_NAVIGATION_PER_CLIENT.delete(client);
        }
        unsubscribe(); // Prevent memory leak
      }
    });
  }

  return navigationSpan;
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
  const branches = Array.isArray(matches) ? matches : _matchRoutes(allRoutes || routes, location, basename);

  const client = getClient();
  if (!client || !CLIENTS_WITH_INSTRUMENT_NAVIGATION.has(client)) {
    return;
  }

  const activeRootSpan = getActiveRootSpan();
  if (activeRootSpan && spanToJSON(activeRootSpan).op === 'pageload' && navigationType === 'POP') {
    return;
  }

  if ((navigationType === 'PUSH' || navigationType === 'POP') && branches) {
    const [name, source] = resolveRouteNameAndSource(
      location,
      allRoutes || routes,
      allRoutes || routes,
      branches as RouteMatch[],
      basename,
    );

    const currentNavigationKey = getNavigationKey(location);
    const isNavDuplicate = isDuplicateNavigation(client, currentNavigationKey);

    if (isNavDuplicate) {
      // Cross-usage duplicate - update existing span name if better
      const activeSpan = getActiveSpan();
      const spanJson = activeSpan && spanToJSON(activeSpan);
      const isAlreadyInNavigationSpan = spanJson?.op === 'navigation';

      if (isAlreadyInNavigationSpan && activeSpan) {
        tryUpdateSpanName(activeSpan, spanJson?.description, name, source);
      }
    } else {
      // Not a cross-usage duplicate - create new span
      // This handles: different routes, same route with different params (/user/2 → /user/3)
      // startBrowserTracingNavigationSpan will end any active navigation span
      createNavigationSpan({
        client,
        name,
        source,
        version,
        location,
        routes,
        basename,
        allRoutes,
        navigationKey: currentNavigationKey,
      });
    }
  }
}

/* Only exported for testing purposes */
export function addRoutesToAllRoutes(routes: RouteObject[]): void {
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

function updatePageloadTransaction({
  activeRootSpan,
  location,
  routes,
  matches,
  basename,
  allRoutes,
}: {
  activeRootSpan: Span | undefined;
  location: Location;
  routes: RouteObject[];
  matches?: AgnosticDataRouteMatch;
  basename?: string;
  allRoutes?: RouteObject[];
}): void {
  const branches = Array.isArray(matches)
    ? matches
    : (_matchRoutes(allRoutes || routes, location, basename) as unknown as RouteMatch[]);

  if (branches) {
    const [name, source] = resolveRouteNameAndSource(
      location,
      allRoutes || routes,
      allRoutes || routes,
      branches,
      basename,
    );

    getCurrentScope().setTransactionName(name || '/');

    if (activeRootSpan) {
      activeRootSpan.updateName(name);
      activeRootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source);

      // Patch span.end() to ensure we update the name one last time before the span is sent
      patchPageloadSpanEnd(activeRootSpan, location, routes, basename, allRoutes);
    }
  }
}

/**
 * Patches the span.end() method to update the transaction name one last time before the span is sent.
 * This handles cases where the span is cancelled early (e.g., document.hidden) before lazy routes have finished loading.
 */
function patchSpanEnd(
  span: Span,
  location: Location,
  routes: RouteObject[],
  basename: string | undefined,
  _allRoutes: RouteObject[] | undefined,
  spanType: 'pageload' | 'navigation',
): void {
  const patchedPropertyName = `__sentry_${spanType}_end_patched__` as const;
  const hasEndBeenPatched = (span as unknown as Record<string, boolean | undefined>)?.[patchedPropertyName];

  if (hasEndBeenPatched || !span.end) {
    return;
  }

  const originalEnd = span.end.bind(span);

  span.end = function patchedEnd(...args) {
    try {
      // Only update if the span source is not already 'route' (i.e., it hasn't been parameterized yet)
      const spanJson = spanToJSON(span);
      const currentSource = spanJson.data?.[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];
      if (currentSource !== 'route') {
        // Last chance to update the transaction name with the latest route info
        // Use the live global allRoutes Set to include any lazy routes loaded after patching
        const currentAllRoutes = Array.from(allRoutes);
        const branches = _matchRoutes(
          currentAllRoutes.length > 0 ? currentAllRoutes : routes,
          location,
          basename,
        ) as unknown as RouteMatch[];

        if (branches) {
          const [name, source] = resolveRouteNameAndSource(
            location,
            currentAllRoutes.length > 0 ? currentAllRoutes : routes,
            currentAllRoutes.length > 0 ? currentAllRoutes : routes,
            branches,
            basename,
          );

          // Only update if we have a valid name
          if (name && (spanType === 'pageload' || !spanJson.timestamp)) {
            span.updateName(name);
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source);
          }
        }
      }
    } catch (error) {
      // Silently catch errors to ensure span.end() is always called
      DEBUG_BUILD && debug.warn(`Error updating span details before ending: ${error}`);
    }

    return originalEnd(...args);
  };

  // Mark this span as having its end() method patched to prevent duplicate patching
  addNonEnumerableProperty(span as unknown as Record<string, boolean>, patchedPropertyName, true);
}

function patchPageloadSpanEnd(
  span: Span,
  location: Location,
  routes: RouteObject[],
  basename: string | undefined,
  _allRoutes: RouteObject[] | undefined,
): void {
  patchSpanEnd(span, location, routes, basename, _allRoutes, 'pageload');
}

function patchNavigationSpanEnd(
  span: Span,
  location: Location,
  routes: RouteObject[],
  basename: string | undefined,
  _allRoutes: RouteObject[] | undefined,
): void {
  patchSpanEnd(span, location, routes, basename, _allRoutes, 'navigation');
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

          updatePageloadTransaction({
            activeRootSpan: getActiveRootSpan(),
            location,
            routes,
            allRoutes: Array.from(allRoutes),
          });
          isMountRenderPass.current = false;
        } else {
          handleNavigation({ location, routes, navigationType, version, allRoutes: Array.from(allRoutes) });
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
