// Inspired from Donnie McNeal's solution:
// https://gist.github.com/wontondon/e8c4bdf2888875e4c755712e99279536

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
  getClient,
  getCurrentScope,
  getRootSpan,
  spanToJSON,
} from '@sentry/core';
import type { Client, Integration, Span, TransactionSource } from '@sentry/types';
import { getNumberOfUrlSegments, logger } from '@sentry/utils';
import hoistNonReactStatics from 'hoist-non-react-statics';
import * as React from 'react';

import { DEBUG_BUILD } from './debug-build';
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

const CLIENTS_WITH_INSTRUMENT_NAVIGATION = new WeakSet<Client>();

interface ReactRouterOptions {
  useEffect: UseEffect;
  useLocation: UseLocation;
  useNavigationType: UseNavigationType;
  createRoutesFromChildren: CreateRoutesFromChildren;
  matchRoutes: MatchRoutes;
  stripBasename?: boolean;
}

/**
 * A browser tracing integration that uses React Router v6 to instrument navigations.
 * Expects `useEffect`, `useLocation`, `useNavigationType`, `createRoutesFromChildren` and `matchRoutes` to be passed as options.
 */
export function reactRouterV6BrowserTracingIntegration(
  options: Parameters<typeof browserTracingIntegration>[0] & ReactRouterOptions,
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
    instrumentPageLoad = true,
    instrumentNavigation = true,
  } = options;

  return {
    ...integration,
    setup() {
      _useEffect = useEffect;
      _useLocation = useLocation;
      _useNavigationType = useNavigationType;
      _matchRoutes = matchRoutes;
      _createRoutesFromChildren = createRoutesFromChildren;
      _stripBasename = stripBasename || false;
    },
    afterAllSetup(client) {
      integration.afterAllSetup(client);

      const initPathName = WINDOW && WINDOW.location && WINDOW.location.pathname;
      if (instrumentPageLoad && initPathName) {
        startBrowserTracingPageLoadSpan(client, {
          name: initPathName,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.react.reactrouter_v6',
          },
        });
      }

      if (instrumentNavigation) {
        CLIENTS_WITH_INSTRUMENT_NAVIGATION.add(client);
      }
    },
  };
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
          return [_stripBasename ? stripBasenameFromPathname(branch.pathname, basename) : branch.pathname, 'route'];
        }

        const path = route.path;
        if (path) {
          const newPath = path[0] === '/' || pathBuilder[pathBuilder.length - 1] === '/' ? path : `/${path}`;
          pathBuilder += newPath;

          if (basename + branch.pathname === location.pathname) {
            if (
              // If the route defined on the element is something like
              // <Route path="/stores/:storeId/products/:productId" element={<div>Product</div>} />
              // We should check against the branch.pathname for the number of / separators
              getNumberOfUrlSegments(pathBuilder) !== getNumberOfUrlSegments(branch.pathname) &&
              // We should not count wildcard operators in the url segments calculation
              pathBuilder.slice(-2) !== '/*'
            ) {
              return [(_stripBasename ? '' : basename) + newPath, 'route'];
            }
            return [(_stripBasename ? '' : basename) + pathBuilder, 'route'];
          }
        }
      }
    }
  }

  return [_stripBasename ? stripBasenameFromPathname(location.pathname, basename) : location.pathname, 'url'];
}

function updatePageloadTransaction(
  activeRootSpan: Span | undefined,
  location: Location,
  routes: RouteObject[],
  matches?: AgnosticDataRouteMatch,
  basename?: string,
): void {
  const branches = Array.isArray(matches)
    ? matches
    : (_matchRoutes(routes, location, basename) as unknown as RouteMatch[]);

  if (branches) {
    const [name, source] = getNormalizedName(routes, location, branches, basename);

    getCurrentScope().setTransactionName(name);

    if (activeRootSpan) {
      activeRootSpan.updateName(name);
      activeRootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source);
    }
  }
}

function handleNavigation(
  location: Location,
  routes: RouteObject[],
  navigationType: Action,
  matches?: AgnosticDataRouteMatch,
  basename?: string,
): void {
  const branches = Array.isArray(matches) ? matches : _matchRoutes(routes, location, basename);

  const client = getClient();
  if (!client || !CLIENTS_WITH_INSTRUMENT_NAVIGATION.has(client)) {
    return;
  }

  if ((navigationType === 'PUSH' || navigationType === 'POP') && branches) {
    const [name, source] = getNormalizedName(routes, location, branches, basename);

    startBrowserTracingNavigationSpan(client, {
      name,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v6',
      },
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withSentryReactRouterV6Routing<P extends Record<string, any>, R extends React.FC<P>>(Routes: R): R {
  if (!_useEffect || !_useLocation || !_useNavigationType || !_createRoutesFromChildren || !_matchRoutes) {
    DEBUG_BUILD &&
      logger.warn(`reactRouterV6Instrumentation was unable to wrap Routes because of one or more missing parameters.
      useEffect: ${_useEffect}. useLocation: ${_useLocation}. useNavigationType: ${_useNavigationType}.
      createRoutesFromChildren: ${_createRoutesFromChildren}. matchRoutes: ${_matchRoutes}.`);

    return Routes;
  }

  let isMountRenderPass: boolean = true;

  const SentryRoutes: React.FC<P> = (props: P) => {
    const location = _useLocation();
    const navigationType = _useNavigationType();

    _useEffect(
      () => {
        const routes = _createRoutesFromChildren(props.children) as RouteObject[];

        if (isMountRenderPass) {
          updatePageloadTransaction(getActiveRootSpan(), location, routes);
          isMountRenderPass = false;
        } else {
          handleNavigation(location, routes, navigationType);
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

export function wrapUseRoutes(origUseRoutes: UseRoutes): UseRoutes {
  if (!_useEffect || !_useLocation || !_useNavigationType || !_matchRoutes) {
    DEBUG_BUILD &&
      logger.warn(
        'reactRouterV6Instrumentation was unable to wrap `useRoutes` because of one or more missing parameters.',
      );

    return origUseRoutes;
  }

  let isMountRenderPass: boolean = true;

  const SentryRoutes: React.FC<{
    children?: React.ReactNode;
    routes: RouteObject[];
    locationArg?: Partial<Location> | string;
  }> = (props: { children?: React.ReactNode; routes: RouteObject[]; locationArg?: Partial<Location> | string }) => {
    const { routes, locationArg } = props;

    const Routes = origUseRoutes(routes, locationArg);

    const location = _useLocation();
    const navigationType = _useNavigationType();

    // A value with stable identity to either pick `locationArg` if available or `location` if not
    const stableLocationParam =
      typeof locationArg === 'string' || (locationArg && locationArg.pathname)
        ? (locationArg as { pathname: string })
        : location;

    _useEffect(() => {
      const normalizedLocation =
        typeof stableLocationParam === 'string' ? { pathname: stableLocationParam } : stableLocationParam;

      if (isMountRenderPass) {
        updatePageloadTransaction(getActiveRootSpan(), normalizedLocation, routes);
        isMountRenderPass = false;
      } else {
        handleNavigation(normalizedLocation, routes, navigationType);
      }
    }, [navigationType, stableLocationParam]);

    return Routes;
  };

  // eslint-disable-next-line react/display-name
  return (routes: RouteObject[], locationArg?: Partial<Location> | string): React.ReactElement | null => {
    return <SentryRoutes routes={routes} locationArg={locationArg} />;
  };
}

export function wrapCreateBrowserRouter<
  TState extends RouterState = RouterState,
  TRouter extends Router<TState> = Router<TState>,
>(createRouterFunction: CreateRouterFunction<TState, TRouter>): CreateRouterFunction<TState, TRouter> {
  if (!_useEffect || !_useLocation || !_useNavigationType || !_matchRoutes) {
    DEBUG_BUILD &&
      logger.warn(
        'reactRouterV6Instrumentation was unable to wrap the `createRouter` function because of one or more missing parameters.',
      );

    return createRouterFunction;
  }

  // `opts` for createBrowserHistory and createMemoryHistory are different, but also not relevant for us at the moment.
  // `basename` is the only option that is relevant for us, and it is the same for all.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (routes: RouteObject[], opts?: Record<string, any> & { basename?: string }): TRouter {
    const router = createRouterFunction(routes, opts);
    const basename = opts && opts.basename;

    const activeRootSpan = getActiveRootSpan();

    // The initial load ends when `createBrowserRouter` is called.
    // This is the earliest convenient time to update the transaction name.
    // Callbacks to `router.subscribe` are not called for the initial load.
    if (router.state.historyAction === 'POP' && activeRootSpan) {
      updatePageloadTransaction(activeRootSpan, router.state.location, routes, undefined, basename);
    }

    router.subscribe((state: RouterState) => {
      const location = state.location;
      if (state.historyAction === 'PUSH' || state.historyAction === 'POP') {
        handleNavigation(location, routes, state.historyAction, undefined, basename);
      }
    });

    return router;
  };
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
