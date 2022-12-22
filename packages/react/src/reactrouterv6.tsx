// Inspired from Donnie McNeal's solution:
// https://gist.github.com/wontondon/e8c4bdf2888875e4c755712e99279536

import { WINDOW } from '@sentry/browser';
import { Transaction, TransactionContext, TransactionSource } from '@sentry/types';
import { getNumberOfUrlSegments, logger } from '@sentry/utils';
import hoistNonReactStatics from 'hoist-non-react-statics';
import React from 'react';

import {
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
          if (branch.pathname === location.pathname) {
            if (
              // If the route defined on the element is something like
              // <Route path="/stores/:storeId/products/:productId" element={<div>Product</div>} />
              // We should check against the branch.pathname for the number of / seperators
              getNumberOfUrlSegments(pathBuilder) !== getNumberOfUrlSegments(branch.pathname) &&
              // We should not count wildcard operators in the url segments calculation
              pathBuilder.slice(-2) !== '/*'
            ) {
              return [newPath, 'route'];
            }
            return [pathBuilder, 'route'];
          }
        }
      }
    }
  }

  return [location.pathname, 'url'];
}

function updatePageloadTransaction(location: Location, routes: RouteObject[], matches?: AgnosticDataRouteMatch): void {
  const branches = Array.isArray(matches) ? matches : (_matchRoutes(routes, location) as unknown as RouteMatch[]);

  if (activeTransaction && branches) {
    activeTransaction.setName(...getNormalizedName(routes, location, branches));
  }
}

function handleNavigation(
  location: Location,
  routes: RouteObject[],
  navigationType: Action,
  matches?: AgnosticDataRouteMatch,
): void {
  const branches = Array.isArray(matches) ? matches : _matchRoutes(routes, location);

  if (_startTransactionOnLocationChange && (navigationType === 'PUSH' || navigationType === 'POP') && branches) {
    if (activeTransaction) {
      activeTransaction.finish();
    }

    const [name, source] = getNormalizedName(routes, location, branches);
    activeTransaction = _customStartTransaction({
      name,
      op: 'navigation',
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
    __DEBUG_BUILD__ &&
      logger.warn(`reactRouterV6Instrumentation was unable to wrap Routes because of one or more missing parameters.
      useEffect: ${_useEffect}. useLocation: ${_useLocation}. useNavigationType: ${_useNavigationType}.
      createRoutesFromChildren: ${_createRoutesFromChildren}. matchRoutes: ${_matchRoutes}. customStartTransaction: ${_customStartTransaction}.`);

    return Routes;
  }

  let routes: RouteObject[];
  let isFirstPageloadUpdateUseEffectCall = true;
  let isFirstNavigationUseEffectCall = true;

  const SentryRoutes: React.FC<P> = (props: P) => {
    const location = _useLocation();
    const navigationType = _useNavigationType();

    _useEffect(() => {
      // Performance concern:
      // This is repeated when <Routes /> is rendered.
      routes = _createRoutesFromChildren(props.children) as RouteObject[];
    }, [props.children]);

    _useEffect(() => {
      if (isFirstPageloadUpdateUseEffectCall) {
        isFirstPageloadUpdateUseEffectCall = false;
        routes = _createRoutesFromChildren(props.children) as RouteObject[];
        updatePageloadTransaction(location, routes);
      }
    }, [props.children, location]);

    _useEffect(() => {
      if (isFirstNavigationUseEffectCall) {
        isFirstNavigationUseEffectCall = false;
      } else {
        handleNavigation(location, routes, navigationType);
      }
    }, [location, navigationType]);

    // @ts-ignore Setting more specific React Component typing for `R` generic above
    // will break advanced type inference done by react router params
    return <Routes {...props} />;
  };

  hoistNonReactStatics(SentryRoutes, Routes);

  // @ts-ignore Setting more specific React Component typing for `R` generic above
  // will break advanced type inference done by react router params
  return SentryRoutes;
}

export function wrapUseRoutes(origUseRoutes: UseRoutes): UseRoutes {
  if (!_useEffect || !_useLocation || !_useNavigationType || !_matchRoutes || !_customStartTransaction) {
    __DEBUG_BUILD__ &&
      logger.warn(
        'reactRouterV6Instrumentation was unable to wrap `useRoutes` because of one or more missing parameters.',
      );

    return origUseRoutes;
  }

  let isFirstPageloadUpdateUseEffectCall = true;
  let isFirstNavigationUseEffectCall = true;

  // eslint-disable-next-line react/display-name
  return (routes: RouteObject[], location?: Partial<Location> | string): React.ReactElement | null => {
    const SentryRoutes: React.FC<unknown> = (props: unknown) => {
      const Routes = origUseRoutes(routes, location);

      // the case where location is a string might be killing performance because we're always creating a new
      // object(with different identity) that will trigger useEffects below to run again
      const locationArgObject = typeof location === 'string' ? { pathname: location } : location;

      const locationObject = (locationArgObject as Location) || _useLocation();
      const navigationType = _useNavigationType();

      _useEffect(() => {
        if (isFirstPageloadUpdateUseEffectCall) {
          isFirstPageloadUpdateUseEffectCall = false;
          updatePageloadTransaction(locationObject, routes);
        }
      }, [locationObject, routes]);

      _useEffect(() => {
        if (isFirstNavigationUseEffectCall) {
          isFirstNavigationUseEffectCall = false;
        } else {
          handleNavigation(locationObject, routes, navigationType);
        }
      }, [locationObject, routes, navigationType]);

      return Routes;
    };

    return <SentryRoutes />;
  };
}

export function wrapCreateBrowserRouter(createRouterFunction: CreateRouterFunction): CreateRouterFunction {
  // `opts` for createBrowserHistory and createMemoryHistory are different, but also not relevant for us at the moment.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (routes: RouteObject[], opts?: any): Router {
    const router = createRouterFunction(routes, opts);

    // The initial load ends when `createBrowserRouter` is called.
    // This is the earliest convenient time to update the transaction name.
    // Callbacks to `router.subscribe` are not called for the initial load.
    if (router.state.historyAction === 'POP' && activeTransaction) {
      updatePageloadTransaction(router.state.location, routes);
    }

    router.subscribe((state: RouterState) => {
      const location = state.location;

      if (
        _startTransactionOnLocationChange &&
        (state.historyAction === 'PUSH' || state.historyAction === 'POP') &&
        activeTransaction
      ) {
        handleNavigation(location, routes, state.historyAction);
      }
    });

    return router;
  };
}
