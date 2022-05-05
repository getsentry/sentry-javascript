import { Transaction, TransactionContext } from '@sentry/types';
import hoistNonReactStatics from 'hoist-non-react-statics';
import * as React from 'react';

import { Action, Location } from './types';

interface RouteObject {
  caseSensitive?: boolean;
  children?: RouteObject[];
  element?: React.ReactNode;
  index?: boolean;
  path?: string;
}

type Params<Key extends string = string> = {
  readonly [key in Key]: string | undefined;
};

interface RouteMatch<ParamKey extends string = string> {
  params: Params<ParamKey>;
  pathname: string;
  route: RouteObject;
}

type UseLocation = () => Location;
type UseNavigationType = () => Action;
type CreateRoutesFromChildren = (children: JSX.Element[]) => RouteObject[];
type MatchRoutes = (routes: RouteObject[], location: Location) => RouteMatch[];

interface ReactRouterV6InstrumentationOptions {
  customStartTransaction: (context: TransactionContext) => Transaction | undefined;
  useLocation: UseLocation;
  useNavigationType: UseNavigationType;
  createRoutesFromChildren: CreateRoutesFromChildren;
  matchRoutes: MatchRoutes;
  startTransactionOnLocationChange?: boolean;
  startTransactionOnPageLoad?: boolean;
}

const instrumentationOptions: Partial<ReactRouterV6InstrumentationOptions> = {
  customStartTransaction: () => undefined,
};

export function reactRouterV6Instrumentation(
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
    instrumentationOptions.useLocation = useLocation;
    instrumentationOptions.useNavigationType = useNavigationType;
    instrumentationOptions.matchRoutes = matchRoutes;
    instrumentationOptions.createRoutesFromChildren = createRoutesFromChildren;

    instrumentationOptions.customStartTransaction = customStartTransaction;
    instrumentationOptions.startTransactionOnLocationChange = startTransactionOnLocationChange;
    instrumentationOptions.startTransactionOnPageLoad = startTransactionOnPageLoad;
  };
}

const getTransactionName = (routes: RouteObject[], location: Location, matchRoutes: MatchRoutes): string => {
  if (!routes || routes.length === 0 || !matchRoutes) {
    return location.pathname;
  }

  const branches = matchRoutes(routes, location);

  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let x = 0; x < branches.length; x++) {
    if (branches[x].route && branches[x].route.path) {
      return branches[x].route.path || location.pathname;
    }
  }

  return location.pathname;
};

const SENTRY_TAGS = {
  'routing.instrumentation': 'react-router-v6',
};

export function withSentryV6<P extends Record<string, any>, R extends React.ComponentType<P>>(Routes: R): R {
  const { useLocation, useNavigationType, createRoutesFromChildren, matchRoutes, customStartTransaction } =
    instrumentationOptions;

  if (!useLocation || !useNavigationType || !createRoutesFromChildren || !matchRoutes || !customStartTransaction) {
    // Log warning?
    return Routes;
  }

  const SentryRoutes: React.FC<P> = (props: P) => {
    const location = useLocation();
    const navigationType = useNavigationType();
    const isBaseLocation = React.useRef<boolean>(false);
    const activeTransaction = React.useRef<Transaction>();
    const routes = React.useRef<RouteObject[]>([]);

    React.useEffect(() => {
      // Performance concern:
      // This is repeated when <Routes /> is rendered.
      routes.current = createRoutesFromChildren(props.children);
    }, [props.children]);

    React.useEffect(() => {
      const transactionName = getTransactionName(routes.current, location, matchRoutes);

      isBaseLocation.current = true;

      activeTransaction.current = customStartTransaction({
        name: transactionName,
        op: 'pageload',
        tags: SENTRY_TAGS,
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    React.useEffect(() => {
      if (isBaseLocation.current) {
        if (activeTransaction.current) {
          activeTransaction.current.finish();
        }

        return;
      }

      if (navigationType === 'PUSH' || navigationType === 'POP') {
        if (activeTransaction.current) {
          activeTransaction.current.finish();
        }

        const transactionName = getTransactionName(routes.current, location, matchRoutes);

        activeTransaction.current = customStartTransaction({
          name: transactionName,
          op: 'navigation',
          tags: SENTRY_TAGS,
        });
      }
    }, [navigationType, location, isBaseLocation]);

    // @ts-ignore Setting more specific React Component typing for `R` generic above
    // will break advanced type inference done by react router params:
    return <Routes {...props} />;
  };

  hoistNonReactStatics(SentryRoutes, Routes);

  // @ts-ignore Setting more specific React Component typing for `R` generic above
  // will break advanced type inference done by react router params:
  return SentryRoutes;
}

export default SentryRoutes;
