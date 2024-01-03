// Inspired from Donnie McNeal's solution:
// https://gist.github.com/wontondon/e8c4bdf2888875e4c755712e99279536

import { WINDOW } from '@sentry/browser';
import type { Transaction, TransactionContext, TransactionSource } from '@sentry/types';
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

let activeTransaction: Transaction | undefined;

let _useEffect: UseEffect;
let _useLocation: UseLocation;
let _useNavigationType: UseNavigationType;
let _createRoutesFromChildren: CreateRoutesFromChildren;
let _matchRoutes: MatchRoutes;
let _customStartTransaction: (context: TransactionContext) => Transaction | undefined;
let _startTransactionOnLocationChange: boolean;

const SENTRY_TAGS = {
  'routing.instrumentation': 'react-router-v6',
};

export function reactRouterV6Instrumentation(
  useEffect: UseEffect,
  useLocation: UseLocation,
  useNavigationType: UseNavigationType,
  createRoutesFromChildren: CreateRoutesFromChildren,
  matchRoutes: MatchRoutes,
) {
  return (
    customStartTransaction: (context: TransactionContext) => Transaction | undefined,
    startTransactionOnPageLoad = true,
    startTransactionOnLocationChange = true,
  ): void => {
    const initPathName = WINDOW && WINDOW.location && WINDOW.location.pathname;
    if (startTransactionOnPageLoad && initPathName) {
      activeTransaction = customStartTransaction({
        name: initPathName,
        op: 'pageload',
        origin: 'auto.pageload.react.reactrouterv6',
        tags: SENTRY_TAGS,
        metadata: {
          source: 'url',
        },
      });
    }

    _useEffect = useEffect;
    _useLocation = useLocation;
    _useNavigationType = useNavigationType;
    _matchRoutes = matchRoutes;
    _createRoutesFromChildren = createRoutesFromChildren;

    _customStartTransaction = customStartTransaction;
    _startTransactionOnLocationChange = startTransactionOnLocationChange;
  };
}

function getNormalizedName(
  routes: RouteObject[],
  location: Location,
  branches: RouteMatch[],
  basename: string = '',
): [string, TransactionSource] {
  if (!routes || routes.length === 0) {
    return [location.pathname, 'url'];
  }

  let pathBuilder = '';
  if (branches) {
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let x = 0; x < branches.length; x++) {
      const branch = branches[x];
      const route = branch.route;
      if (route) {
        // Early return if index route
        if (route.index) {
          return [branch.pathname, 'route'];
        }

        const path = route.path;
        if (path) {
          const newPath = path[0] === '/' || pathBuilder[pathBuilder.length - 1] === '/' ? path : `/${path}`;
          pathBuilder += newPath;

          if (basename + branch.pathname === location.pathname) {
            if (
              // If the route defined on the element is something like
              // <Route path="/stores/:storeId/products/:productId" element={<div>Product</div>} />
              // We should check against the branch.pathname for the number of / seperators
              getNumberOfUrlSegments(pathBuilder) !== getNumberOfUrlSegments(branch.pathname) &&
              // We should not count wildcard operators in the url segments calculation
              pathBuilder.slice(-2) !== '/*'
            ) {
              return [basename + newPath, 'route'];
            }
            return [basename + pathBuilder, 'route'];
          }
        }
      }
    }
  }

  return [location.pathname, 'url'];
}

function updatePageloadTransaction(
  location: Location,
  routes: RouteObject[],
  matches?: AgnosticDataRouteMatch,
  basename?: string,
): void {
  const branches = Array.isArray(matches)
    ? matches
    : (_matchRoutes(routes, location, basename) as unknown as RouteMatch[]);

  if (activeTransaction && branches) {
    const [name, source] = getNormalizedName(routes, location, branches, basename);
    activeTransaction.updateName(name);
    activeTransaction.setMetadata({ source });
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

  if (_startTransactionOnLocationChange && (navigationType === 'PUSH' || navigationType === 'POP') && branches) {
    if (activeTransaction) {
      activeTransaction.end();
    }

    const [name, source] = getNormalizedName(routes, location, branches, basename);
    activeTransaction = _customStartTransaction({
      name,
      op: 'navigation',
      origin: 'auto.navigation.react.reactrouterv6',
      tags: SENTRY_TAGS,
      metadata: {
        source,
      },
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withSentryReactRouterV6Routing<P extends Record<string, any>, R extends React.FC<P>>(Routes: R): R {
  if (
    !_useEffect ||
    !_useLocation ||
    !_useNavigationType ||
    !_createRoutesFromChildren ||
    !_matchRoutes ||
    !_customStartTransaction
  ) {
    DEBUG_BUILD &&
      logger.warn(`reactRouterV6Instrumentation was unable to wrap Routes because of one or more missing parameters.
      useEffect: ${_useEffect}. useLocation: ${_useLocation}. useNavigationType: ${_useNavigationType}.
      createRoutesFromChildren: ${_createRoutesFromChildren}. matchRoutes: ${_matchRoutes}. customStartTransaction: ${_customStartTransaction}.`);

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
          updatePageloadTransaction(location, routes);
          isMountRenderPass = false;
        } else {
          handleNavigation(location, routes, navigationType);
        }
      },
      // `props.children` is purpusely not included in the dependency array, because we do not want to re-run this effect
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
  if (!_useEffect || !_useLocation || !_useNavigationType || !_matchRoutes || !_customStartTransaction) {
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
        updatePageloadTransaction(normalizedLocation, routes);
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
  // `opts` for createBrowserHistory and createMemoryHistory are different, but also not relevant for us at the moment.
  // `basename` is the only option that is relevant for us, and it is the same for all.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (routes: RouteObject[], opts?: Record<string, any> & { basename?: string }): TRouter {
    const router = createRouterFunction(routes, opts);
    const basename = opts && opts.basename;

    // The initial load ends when `createBrowserRouter` is called.
    // This is the earliest convenient time to update the transaction name.
    // Callbacks to `router.subscribe` are not called for the initial load.
    if (router.state.historyAction === 'POP' && activeTransaction) {
      updatePageloadTransaction(router.state.location, routes, undefined, basename);
    }

    router.subscribe((state: RouterState) => {
      const location = state.location;

      if (
        _startTransactionOnLocationChange &&
        (state.historyAction === 'PUSH' || state.historyAction === 'POP') &&
        activeTransaction
      ) {
        handleNavigation(location, routes, state.historyAction, undefined, basename);
      }
    });

    return router;
  };
}
