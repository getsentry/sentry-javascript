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
  getClient,
  getCurrentScope,
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
import {
  clearNavigationContext,
  getActiveRootSpan,
  initializeRouterUtils,
  resolveRouteNameAndSource,
  setNavigationContext,
  transactionNameHasWildcard,
} from './utils';

let _useEffect: UseEffect;
let _useLocation: UseLocation;
let _useNavigationType: UseNavigationType;
let _createRoutesFromChildren: CreateRoutesFromChildren;
let _matchRoutes: MatchRoutes;

let _enableAsyncRouteHandlers: boolean = false;
let _lazyRouteTimeout = 3000;

const CLIENTS_WITH_INSTRUMENT_NAVIGATION = new WeakSet<Client>();

// Prevents duplicate spans when router.subscribe fires multiple times
const activeNavigationSpans = new WeakMap<
  Client,
  { span: Span; routeName: string; pathname: string; locationKey: string; isPlaceholder?: boolean }
>();

// Exported for testing only
export const allRoutes = new Set<RouteObject>();

// Tracks lazy route loads to wait before finalizing span names
const pendingLazyRouteLoads = new WeakMap<Span, Set<Promise<unknown>>>();

// Tracks deferred lazy route promises that can be resolved when patchRoutesOnNavigation is called
const deferredLazyRouteResolvers = new WeakMap<Span, () => void>();

/**
 * Schedules a callback using requestAnimationFrame when available (browser),
 * or falls back to setTimeout for SSR environments (Node.js, createMemoryRouter tests).
 */
function scheduleCallback(callback: () => void): number {
  if (WINDOW?.requestAnimationFrame) {
    return WINDOW.requestAnimationFrame(callback);
  }
  return setTimeout(callback, 0) as unknown as number;
}

/**
 * Cancels a scheduled callback, handling both RAF (browser) and timeout (SSR) IDs.
 */
function cancelScheduledCallback(id: number): void {
  if (WINDOW?.cancelAnimationFrame) {
    WINDOW.cancelAnimationFrame(id);
  } else {
    clearTimeout(id);
  }
}

/**
 * Computes location key for duplicate detection. Normalizes undefined/null to empty strings.
 * Exported for testing.
 */
export function computeLocationKey(location: Location): string {
  return `${location.pathname}${location.search || ''}${location.hash || ''}`;
}

/**
 * Checks if a route name is parameterized (contains route parameters like :id or wildcards like *)
 * vs a raw URL path.
 */
function isParameterizedRoute(routeName: string): boolean {
  return routeName.includes(':') || routeName.includes('*');
}

/**
 * Determines if a navigation should be skipped as a duplicate, and if an existing span should be updated.
 * Exported for testing.
 *
 * @returns An object with:
 *   - skip: boolean - Whether to skip creating a new span
 *   - shouldUpdate: boolean - Whether to update the existing span name (wildcard upgrade)
 */
export function shouldSkipNavigation(
  trackedNav:
    | { span: Span; routeName: string; pathname: string; locationKey: string; isPlaceholder?: boolean }
    | undefined,
  locationKey: string,
  proposedName: string,
  spanHasEnded: boolean,
): { skip: boolean; shouldUpdate: boolean } {
  if (!trackedNav) {
    return { skip: false, shouldUpdate: false };
  }

  // Check if this is a duplicate navigation (same location)
  // 1. If it's a placeholder, it's always a duplicate (we're waiting for the real one)
  // 2. If it's a real span, it's a duplicate only if it hasn't ended yet
  const isDuplicate = trackedNav.locationKey === locationKey && (trackedNav.isPlaceholder || !spanHasEnded);

  if (isDuplicate) {
    // Check if we should update the span name with a better route
    // Allow updates if:
    // 1. Current has wildcard and new doesn't (wildcard → parameterized upgrade)
    // 2. Current is raw path and new is parameterized (raw → parameterized upgrade)
    // 3. New name is different and more specific (longer, indicating nested routes resolved)
    const currentHasWildcard = !!trackedNav.routeName && transactionNameHasWildcard(trackedNav.routeName);
    const proposedHasWildcard = transactionNameHasWildcard(proposedName);
    const currentIsParameterized = !!trackedNav.routeName && isParameterizedRoute(trackedNav.routeName);
    const proposedIsParameterized = isParameterizedRoute(proposedName);

    const isWildcardUpgrade = currentHasWildcard && !proposedHasWildcard;
    const isRawToParameterized = !currentIsParameterized && proposedIsParameterized;
    const isMoreSpecific =
      proposedName !== trackedNav.routeName &&
      proposedName.length > (trackedNav.routeName?.length || 0) &&
      !proposedHasWildcard;

    const shouldUpdate = !!(trackedNav.routeName && (isWildcardUpgrade || isRawToParameterized || isMoreSpecific));

    return { skip: true, shouldUpdate };
  }

  return { skip: false, shouldUpdate: false };
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

  /**
   * Maximum time (in milliseconds) to wait for lazy routes to load before finalizing span names.
   *
   * - Set to `0` to not wait at all (immediate finalization)
   * - Set to `Infinity` to wait as long as possible (capped at `finalTimeout` to prevent indefinite hangs)
   * - Negative values will fall back to the default
   *
   * Defaults to 3× the configured `idleTimeout` (default: 3000ms).
   *
   * @default idleTimeout * 3
   */
  lazyRouteTimeout?: number;
}

type V6CompatibleVersion = '6' | '7';

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

/** Registers a pending lazy route load promise for a span. */
function trackLazyRouteLoad(span: Span, promise: Promise<unknown>): void {
  let promises = pendingLazyRouteLoads.get(span);
  if (!promises) {
    promises = new Set();
    pendingLazyRouteLoads.set(span, promises);
  }
  promises.add(promise);

  // Clean up when promise resolves/rejects
  promise.finally(() => {
    const currentPromises = pendingLazyRouteLoads.get(span);
    if (currentPromises) {
      currentPromises.delete(promise);
    }
  });
}

/**
 * Creates a deferred promise for a span that will be resolved when patchRoutesOnNavigation is called.
 * This ensures that patchedEnd waits for patchRoutesOnNavigation to be called before ending the span.
 */
function createDeferredLazyRoutePromise(span: Span): void {
  const deferredPromise = new Promise<void>(resolve => {
    deferredLazyRouteResolvers.set(span, resolve);
  });

  trackLazyRouteLoad(span, deferredPromise);
}

/**
 * Resolves the deferred lazy route promise for a span.
 * Called when patchRoutesOnNavigation is invoked.
 */
function resolveDeferredLazyRoutePromise(span: Span): void {
  const resolver = deferredLazyRouteResolvers.get(span);
  if (resolver) {
    resolver();
    deferredLazyRouteResolvers.delete(span);
    // Clear the flag so patchSpanEnd doesn't wait unnecessarily for routes that have already loaded
    if ((span as unknown as Record<string, boolean>).__sentry_may_have_lazy_routes__) {
      (span as unknown as Record<string, boolean>).__sentry_may_have_lazy_routes__ = false;
    }
  }
}

/**
 * Processes resolved routes by adding them to allRoutes and checking for nested async handlers.
 * When capturedSpan is provided, updates that specific span instead of the current active span.
 * This prevents race conditions where a lazy handler resolves after the user has navigated away.
 */
export function processResolvedRoutes(
  resolvedRoutes: RouteObject[],
  parentRoute?: RouteObject,
  currentLocation: Location | null = null,
  capturedSpan?: Span,
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

  // Use captured span if provided, otherwise fall back to current active span
  const targetSpan = capturedSpan ?? getActiveRootSpan();
  if (targetSpan) {
    const spanJson = spanToJSON(targetSpan);

    // Skip update if span has already ended (timestamp is set when span.end() is called)
    if (spanJson.timestamp) {
      DEBUG_BUILD && debug.warn('[React Router] Lazy handler resolved after span ended - skipping update');
      return;
    }

    const spanOp = spanJson.op;

    // Use captured location for route matching (ensures we match against the correct route)
    // Fall back to window.location only if no captured location and no captured span
    // (i.e., this is not from an async handler)
    let location = currentLocation;
    if (!location && !capturedSpan) {
      if (typeof WINDOW !== 'undefined') {
        const globalLocation = WINDOW.location;
        if (globalLocation?.pathname) {
          location = { pathname: globalLocation.pathname };
        }
      }
    }

    if (location) {
      if (spanOp === 'pageload') {
        // Re-run the pageload transaction update with the newly loaded routes
        updatePageloadTransaction({
          activeRootSpan: targetSpan,
          location: { pathname: location.pathname },
          routes: Array.from(allRoutes),
          allRoutes: Array.from(allRoutes),
        });
      } else if (spanOp === 'navigation') {
        // For navigation spans, update the name with the newly loaded routes
        updateNavigationSpan(targetSpan, location, Array.from(allRoutes), false, _matchRoutes);
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
  const spanJson = spanToJSON(activeRootSpan);
  const currentName = spanJson.description;

  const hasBeenNamed = (activeRootSpan as { __sentry_navigation_name_set__?: boolean })?.__sentry_navigation_name_set__;
  const currentNameHasWildcard = currentName && transactionNameHasWildcard(currentName);
  const shouldUpdate = !hasBeenNamed || forceUpdate || currentNameHasWildcard;

  if (shouldUpdate && !spanJson.timestamp) {
    const currentBranches = matchRoutes(allRoutes, location);
    const [name, source] = resolveRouteNameAndSource(
      location,
      allRoutes,
      allRoutes,
      (currentBranches as RouteMatch[]) || [],
      '',
    );

    const currentSource = spanJson.data?.[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];
    const isImprovement =
      name &&
      (!currentName || // No current name - always set
        (!hasBeenNamed && (currentSource !== 'route' || source === 'route')) || // Not finalized - allow unless downgrading route→url
        (currentSource !== 'route' && source === 'route') || // URL → route upgrade
        (currentSource === 'route' && source === 'route' && currentNameHasWildcard)); // Route → better route (only if current has wildcard)
    if (isImprovement) {
      activeRootSpan.updateName(name);
      activeRootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source);

      // Only mark as finalized for non-wildcard route names (allows URL→route upgrades).
      if (!transactionNameHasWildcard(name) && source === 'route') {
        addNonEnumerableProperty(
          activeRootSpan as { __sentry_navigation_name_set__?: boolean },
          '__sentry_navigation_name_set__',
          true,
        );
      }
    }
  }
}

function setupRouterSubscription(
  router: Router,
  routes: RouteObject[],
  version: V6CompatibleVersion,
  basename: string | undefined,
  activeRootSpan: Span | undefined,
): void {
  let isInitialPageloadComplete = false;
  let hasSeenPageloadSpan = !!activeRootSpan && spanToJSON(activeRootSpan).op === 'pageload';
  let hasSeenPopAfterPageload = false;
  let scheduledNavigationHandler: number | null = null;
  let lastHandledPathname: string | null = null;

  router.subscribe((state: RouterState) => {
    if (!isInitialPageloadComplete) {
      const currentRootSpan = getActiveRootSpan();
      const isCurrentlyInPageload = currentRootSpan && spanToJSON(currentRootSpan).op === 'pageload';

      if (isCurrentlyInPageload) {
        hasSeenPageloadSpan = true;
      } else if (hasSeenPageloadSpan) {
        if (state.historyAction === 'POP' && !hasSeenPopAfterPageload) {
          hasSeenPopAfterPageload = true;
        } else {
          isInitialPageloadComplete = true;
        }
      }
    }

    const shouldHandleNavigation =
      state.historyAction === 'PUSH' || (state.historyAction === 'POP' && isInitialPageloadComplete);

    if (shouldHandleNavigation) {
      // Include search and hash to allow query/hash-only navigations
      // Use computeLocationKey() to ensure undefined/null values are normalized to empty strings
      const currentLocationKey = computeLocationKey(state.location);
      const navigationHandler = (): void => {
        // Prevent multiple calls for the same location within the same navigation cycle
        if (lastHandledPathname === currentLocationKey) {
          return;
        }
        lastHandledPathname = currentLocationKey;
        scheduledNavigationHandler = null;
        handleNavigation({
          location: state.location,
          routes,
          navigationType: state.historyAction,
          version,
          basename,
          allRoutes: Array.from(allRoutes),
        });
      };

      if (state.navigation.state !== 'idle') {
        // Navigation in progress - reset if location changed
        if (lastHandledPathname !== currentLocationKey) {
          lastHandledPathname = null;
        }
        // Cancel any previously scheduled handler to avoid duplicates
        if (scheduledNavigationHandler !== null) {
          cancelScheduledCallback(scheduledNavigationHandler);
        }
        scheduledNavigationHandler = scheduleCallback(navigationHandler);
      } else {
        // Navigation completed - cancel scheduled handler if any, then call immediately
        if (scheduledNavigationHandler !== null) {
          cancelScheduledCallback(scheduledNavigationHandler);
          scheduledNavigationHandler = null;
        }
        navigationHandler();
        // Don't reset - next navigation cycle resets to prevent duplicates within same cycle.
      }
    }
  });
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

    if (_enableAsyncRouteHandlers) {
      for (const route of routes) {
        checkRouteForAsyncHandler(route, processResolvedRoutes);
      }
    }

    // Capture the active span BEFORE creating the router.
    // This is important because the span might end (due to idle timeout) before
    // patchRoutesOnNavigation is called by React Router.
    const activeRootSpan = getActiveRootSpan();

    // If patchRoutesOnNavigation is provided and we have an active span,
    // mark the span as having potential lazy routes and create a deferred promise.
    const hasPatchRoutesOnNavigation =
      opts && 'patchRoutesOnNavigation' in opts && typeof opts.patchRoutesOnNavigation === 'function';
    if (hasPatchRoutesOnNavigation && activeRootSpan) {
      // Mark the span as potentially having lazy routes
      addNonEnumerableProperty(
        activeRootSpan as unknown as Record<string, boolean>,
        '__sentry_may_have_lazy_routes__',
        true,
      );
      createDeferredLazyRoutePromise(activeRootSpan);
    }

    // Pass the captured span to wrapPatchRoutesOnNavigation so it uses the same span
    // even if the span has ended by the time patchRoutesOnNavigation is called.
    const wrappedOpts = wrapPatchRoutesOnNavigation(opts, false, activeRootSpan);
    const router = createRouterFunction(routes, wrappedOpts);
    const basename = opts?.basename;

    if (router.state.historyAction === 'POP' && activeRootSpan) {
      updatePageloadTransaction({
        activeRootSpan,
        location: router.state.location,
        routes,
        basename,
        allRoutes: Array.from(allRoutes),
      });
    }

    setupRouterSubscription(router, routes, version, basename, activeRootSpan);

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

    if (_enableAsyncRouteHandlers) {
      for (const route of routes) {
        checkRouteForAsyncHandler(route, processResolvedRoutes);
      }
    }

    // Capture the active span BEFORE creating the router (same as browser router)
    const memoryActiveRootSpanEarly = getActiveRootSpan();

    // If patchRoutesOnNavigation is provided and we have an active span,
    // mark the span as having potential lazy routes and create a deferred promise.
    const hasPatchRoutesOnNavigation =
      opts && 'patchRoutesOnNavigation' in opts && typeof opts.patchRoutesOnNavigation === 'function';
    if (hasPatchRoutesOnNavigation && memoryActiveRootSpanEarly) {
      addNonEnumerableProperty(
        memoryActiveRootSpanEarly as unknown as Record<string, boolean>,
        '__sentry_may_have_lazy_routes__',
        true,
      );
      createDeferredLazyRoutePromise(memoryActiveRootSpanEarly);
    }

    const wrappedOpts = wrapPatchRoutesOnNavigation(opts, true, memoryActiveRootSpanEarly);

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

    setupRouterSubscription(router, routes, version, basename, memoryActiveRootSpan);

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
    lazyRouteTimeout,
  } = options;

  return {
    ...integration,
    setup(client) {
      integration.setup(client);

      const finalTimeout = options.finalTimeout ?? 30000;
      const defaultMaxWait = (options.idleTimeout ?? 1000) * 3;
      const configuredMaxWait = lazyRouteTimeout ?? defaultMaxWait;

      // Cap Infinity at finalTimeout to prevent indefinite hangs
      if (configuredMaxWait === Infinity) {
        _lazyRouteTimeout = finalTimeout;
        DEBUG_BUILD &&
          debug.log(
            '[React Router] lazyRouteTimeout set to Infinity, capping at finalTimeout:',
            finalTimeout,
            'ms to prevent indefinite hangs',
          );
      } else if (Number.isNaN(configuredMaxWait)) {
        DEBUG_BUILD &&
          debug.warn('[React Router] lazyRouteTimeout must be a number, falling back to default:', defaultMaxWait);
        _lazyRouteTimeout = defaultMaxWait;
      } else if (configuredMaxWait < 0) {
        DEBUG_BUILD &&
          debug.warn(
            '[React Router] lazyRouteTimeout must be non-negative or Infinity, got:',
            configuredMaxWait,
            'falling back to:',
            defaultMaxWait,
          );
        _lazyRouteTimeout = defaultMaxWait;
      } else {
        _lazyRouteTimeout = configuredMaxWait;
      }

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
        // Note: Component-based routes don't support lazy route tracking via lazyRouteTimeout
        // because React.lazy() loads happen at the component level, not the router level.
        // Use createBrowserRouter with patchRoutesOnNavigation for lazy route tracking.
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
  capturedSpan?: Span,
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

      // Use current active span if available, otherwise fall back to captured span (from router creation time).
      // This ensures navigation spans use their own span (not the stale pageload span), while still
      // supporting pageload spans that may have ended before patchRoutesOnNavigation is called.
      const activeRootSpan = getActiveRootSpan() ?? capturedSpan;

      if (!isMemoryRouter) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        const originalPatch = (args as any)?.patch;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        const matches = (args as any)?.matches as Array<{ route: RouteObject }> | undefined;
        if (originalPatch) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          (args as any).patch = (routeId: string, children: RouteObject[]) => {
            addRoutesToAllRoutes(children);

            // Find the parent route from matches and attach children to it in allRoutes.
            // React Router's patch attaches children to its internal route copies, but we need
            // to update the route objects in our allRoutes Set for proper route matching.
            if (matches && matches.length > 0) {
              const leafMatch = matches[matches.length - 1];
              const leafRoute = leafMatch?.route;
              if (leafRoute) {
                // Find the matching route in allRoutes by id, reference, or path
                const matchingRoute = Array.from(allRoutes).find(route => {
                  const idMatches = route.id !== undefined && route.id === routeId;
                  const referenceMatches = route === leafRoute;
                  const pathMatches =
                    route.path !== undefined && leafRoute.path !== undefined && route.path === leafRoute.path;

                  return idMatches || referenceMatches || pathMatches;
                });

                if (matchingRoute) {
                  addResolvedRoutesToParent(children, matchingRoute);
                }
              }
            }

            // Use the captured activeRootSpan instead of getActiveRootSpan() to avoid race conditions
            // where user navigates away during lazy route loading and we'd update the wrong span
            const spanJson = activeRootSpan ? spanToJSON(activeRootSpan) : undefined;
            // Only update if we have a valid targetPath (patchRoutesOnNavigation can be called without path),
            // the captured span exists, hasn't ended, and is a navigation span
            if (
              targetPath &&
              activeRootSpan &&
              spanJson &&
              !spanJson.timestamp && // Span hasn't ended yet
              spanJson.op === 'navigation'
            ) {
              updateNavigationSpan(
                activeRootSpan,
                { pathname: targetPath, search: '', hash: '', state: null, key: 'default' },
                Array.from(allRoutes),
                true,
                _matchRoutes,
              );
            }
            return originalPatch(routeId, children);
          };
        }
      }

      const lazyLoadPromise = (async () => {
        // Set context so async handlers can access correct targetPath and span
        const contextToken = setNavigationContext(targetPath, activeRootSpan);
        let result;
        try {
          result = await originalPatchRoutes(args);
        } finally {
          clearNavigationContext(contextToken);
          // Resolve the deferred promise now that patchRoutesOnNavigation has completed.
          // This ensures patchedEnd has waited long enough for the lazy routes to load.
          if (activeRootSpan) {
            resolveDeferredLazyRoutePromise(activeRootSpan);
          }
        }

        // Use the captured activeRootSpan instead of getActiveRootSpan() to avoid race conditions
        // where user navigates away during lazy route loading and we'd update the wrong span
        const spanJson = activeRootSpan ? spanToJSON(activeRootSpan) : undefined;
        if (
          activeRootSpan &&
          spanJson &&
          !spanJson.timestamp && // Span hasn't ended yet
          spanJson.op === 'navigation'
        ) {
          // Use targetPath consistently - don't fall back to WINDOW.location which may have changed
          // if the user navigated away during async loading
          const pathname = targetPath;

          if (pathname) {
            updateNavigationSpan(
              activeRootSpan,
              { pathname, search: '', hash: '', state: null, key: 'default' },
              Array.from(allRoutes),
              false,
              _matchRoutes,
            );
          }
        }

        return result;
      })();

      if (activeRootSpan) {
        trackLazyRouteLoad(activeRootSpan, lazyLoadPromise);
      }

      return lazyLoadPromise;
    },
  };
}

// eslint-disable-next-line complexity
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

    const locationKey = computeLocationKey(location);
    const trackedNav = activeNavigationSpans.get(client);

    // Determine if this navigation should be skipped as a duplicate
    const trackedSpanHasEnded =
      trackedNav && !trackedNav.isPlaceholder ? !!spanToJSON(trackedNav.span).timestamp : false;
    const { skip, shouldUpdate } = shouldSkipNavigation(trackedNav, locationKey, name, trackedSpanHasEnded);

    if (skip) {
      if (shouldUpdate && trackedNav) {
        const oldName = trackedNav.routeName;

        if (trackedNav.isPlaceholder) {
          // Update placeholder's route name - the real span will be created with this name
          trackedNav.routeName = name;
          DEBUG_BUILD &&
            debug.log(
              `[Tracing] Updated placeholder navigation name from "${oldName}" to "${name}" (will apply to real span)`,
            );
        } else {
          // Update existing real span from wildcard to parameterized route name
          trackedNav.span.updateName(name);
          trackedNav.span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source as 'route' | 'url' | 'custom');
          addNonEnumerableProperty(
            trackedNav.span as { __sentry_navigation_name_set__?: boolean },
            '__sentry_navigation_name_set__',
            true,
          );
          trackedNav.routeName = name;
          DEBUG_BUILD && debug.log(`[Tracing] Updated navigation span name from "${oldName}" to "${name}"`);
        }
      } else {
        DEBUG_BUILD && debug.log(`[Tracing] Skipping duplicate navigation for location: ${locationKey}`);
      }
      return;
    }

    // Create new navigation span (first navigation or legitimate new navigation)
    // Reserve the spot in the map first to prevent race conditions
    // Mark as placeholder to prevent concurrent handleNavigation calls from creating duplicates
    const placeholderSpan = { end: () => {} } as unknown as Span;
    const placeholderEntry = {
      span: placeholderSpan,
      routeName: name,
      pathname: location.pathname,
      locationKey,
      isPlaceholder: true as const,
    };
    activeNavigationSpans.set(client, placeholderEntry);

    let navigationSpan: Span | undefined;
    try {
      navigationSpan = startBrowserTracingNavigationSpan(client, {
        name: placeholderEntry.routeName, // Use placeholder's routeName in case it was updated
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: `auto.navigation.react.reactrouter_v${version}`,
        },
      });
    } catch (e) {
      // If span creation fails, remove the placeholder so we don't block future navigations
      activeNavigationSpans.delete(client);
      throw e;
    }

    if (navigationSpan) {
      // Update the map with the real span (isPlaceholder omitted, defaults to false)
      activeNavigationSpans.set(client, {
        span: navigationSpan,
        routeName: placeholderEntry.routeName, // Use the (potentially updated) placeholder routeName
        pathname: location.pathname,
        locationKey,
      });
      patchSpanEnd(navigationSpan, location, routes, basename, 'navigation');
    } else {
      // If no span was created, remove the placeholder
      activeNavigationSpans.delete(client);
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
      patchSpanEnd(activeRootSpan, location, routes, basename, 'pageload');
    }
  } else if (activeRootSpan) {
    // Even if branches is null (can happen when lazy routes haven't loaded yet),
    // we still need to patch span.end() so that when lazy routes load and the span ends,
    // we can update the transaction name correctly.
    patchSpanEnd(activeRootSpan, location, routes, basename, 'pageload');
  }
}

/**
 * Determines if a span name should be updated during wildcard route resolution.
 *
 * Update conditions (in priority order):
 * 1. No current name + allowNoCurrentName: true → always update (pageload spans)
 * 2. Current name has wildcard + new is route without wildcard → upgrade (e.g., "/users/*" → "/users/:id")
 * 3. Current source is not 'route' + new source is 'route' → upgrade (e.g., URL → parameterized route)
 *
 * @param currentName - The current span name (may be undefined)
 * @param currentSource - The current span source ('route', 'url', or undefined)
 * @param newName - The proposed new span name
 * @param newSource - The proposed new span source
 * @param allowNoCurrentName - If true, allow updates when there's no current name (for pageload spans)
 * @returns true if the span name should be updated
 */
function shouldUpdateWildcardSpanName(
  currentName: string | undefined,
  currentSource: string | undefined,
  newName: string,
  newSource: string,
  allowNoCurrentName = false,
): boolean {
  if (!newName) {
    return false;
  }

  if (!currentName && allowNoCurrentName) {
    return true;
  }

  const hasWildcard = currentName && transactionNameHasWildcard(currentName);

  if (hasWildcard && newSource === 'route' && !transactionNameHasWildcard(newName)) {
    return true;
  }

  if (currentSource !== 'route' && newSource === 'route') {
    return true;
  }

  return false;
}

function tryUpdateSpanNameBeforeEnd(
  span: Span,
  spanJson: ReturnType<typeof spanToJSON>,
  currentName: string | undefined,
  location: Location,
  routes: RouteObject[],
  basename: string | undefined,
  spanType: 'pageload' | 'navigation',
  allRoutes: Set<RouteObject>,
): void {
  try {
    const currentSource = spanJson.data?.[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];

    if (currentSource === 'route' && currentName && !transactionNameHasWildcard(currentName)) {
      return;
    }

    const currentAllRoutes = Array.from(allRoutes);
    const routesToUse = currentAllRoutes.length > 0 ? currentAllRoutes : routes;
    const branches = _matchRoutes(routesToUse, location, basename) as unknown as RouteMatch[];

    if (!branches) {
      return;
    }

    const [name, source] = resolveRouteNameAndSource(location, routesToUse, routesToUse, branches, basename);

    const isImprovement = shouldUpdateWildcardSpanName(currentName, currentSource, name, source, true);
    const spanNotEnded = spanType === 'pageload' || !spanJson.timestamp;

    if (isImprovement && spanNotEnded) {
      span.updateName(name);
      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source);
    }
  } catch (error) {
    DEBUG_BUILD && debug.warn(`Error updating span details before ending: ${error}`);
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
  spanType: 'pageload' | 'navigation',
): void {
  const patchedPropertyName = `__sentry_${spanType}_end_patched__` as const;
  const hasEndBeenPatched = (span as unknown as Record<string, boolean | undefined>)?.[patchedPropertyName];

  if (hasEndBeenPatched || !span.end) {
    return;
  }

  // Uses global allRoutes to access lazy-loaded routes added after this function was called.

  const originalEnd = span.end.bind(span);
  let endCalled = false;

  span.end = function patchedEnd(...args) {
    if (endCalled) {
      return;
    }
    endCalled = true;

    // Capture timestamp immediately to avoid delay from async operations
    // If no timestamp was provided, capture the current time now
    const endTimestamp = args.length > 0 ? args[0] : Date.now() / 1000;

    const spanJson = spanToJSON(span);
    const currentName = spanJson.description;
    const currentSource = spanJson.data?.[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];

    // Helper to clean up activeNavigationSpans after span ends
    const cleanupNavigationSpan = (): void => {
      const client = getClient();
      if (client && spanType === 'navigation') {
        const trackedNav = activeNavigationSpans.get(client);
        if (trackedNav && trackedNav.span === span) {
          activeNavigationSpans.delete(client);
        }
      }
    };

    const pendingPromises = pendingLazyRouteLoads.get(span);
    const mayHaveLazyRoutes = (span as unknown as Record<string, boolean>).__sentry_may_have_lazy_routes__;

    // Wait for lazy routes if:
    // 1. (There are pending promises OR the span was marked as potentially having lazy routes) AND
    // 2. Current name exists AND
    // 3. Either the name has a wildcard OR the source is not 'route' (URL-based names)
    const hasPendingOrMayHaveLazyRoutes = (pendingPromises && pendingPromises.size > 0) || mayHaveLazyRoutes;
    const shouldWaitForLazyRoutes =
      hasPendingOrMayHaveLazyRoutes &&
      currentName &&
      (transactionNameHasWildcard(currentName) || currentSource !== 'route');

    if (shouldWaitForLazyRoutes) {
      if (_lazyRouteTimeout === 0) {
        tryUpdateSpanNameBeforeEnd(span, spanJson, currentName, location, routes, basename, spanType, allRoutes);
        cleanupNavigationSpan();
        originalEnd(endTimestamp);
        return;
      }

      // If we have pending promises, wait for them. Otherwise, just wait for the timeout.
      // This handles the case where we know lazy routes might load but patchRoutesOnNavigation
      // hasn't been called yet.
      const timeoutPromise = new Promise<void>(r => setTimeout(r, _lazyRouteTimeout));
      let waitPromise: Promise<void>;

      if (pendingPromises && pendingPromises.size > 0) {
        const allSettled = Promise.allSettled(pendingPromises).then(() => {});
        waitPromise = _lazyRouteTimeout === Infinity ? allSettled : Promise.race([allSettled, timeoutPromise]);
      } else {
        // No pending promises yet, but we know lazy routes might load
        // Wait for the timeout to give React Router time to call patchRoutesOnNavigation
        waitPromise = timeoutPromise;
      }

      waitPromise
        .then(() => {
          const updatedSpanJson = spanToJSON(span);
          tryUpdateSpanNameBeforeEnd(
            span,
            updatedSpanJson,
            updatedSpanJson.description,
            location,
            routes,
            basename,
            spanType,
            allRoutes,
          );
          cleanupNavigationSpan();
          originalEnd(endTimestamp);
        })
        .catch(() => {
          cleanupNavigationSpan();
          originalEnd(endTimestamp);
        });
      return;
    }

    tryUpdateSpanNameBeforeEnd(span, spanJson, currentName, location, routes, basename, spanType, allRoutes);
    cleanupNavigationSpan();
    originalEnd(endTimestamp);
  };

  addNonEnumerableProperty(span as unknown as Record<string, boolean>, patchedPropertyName, true);
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
          // Note: Component-based routes don't support lazy route tracking via lazyRouteTimeout
          // because React.lazy() loads happen at the component level, not the router level.
          // Use createBrowserRouter with patchRoutesOnNavigation for lazy route tracking.
          handleNavigation({ location, routes, navigationType, version, allRoutes: Array.from(allRoutes) });
        }
      },
      // Re-run only on location/navigation changes, not children changes
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
