import { WINDOW } from '@sentry/browser';
import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, getActiveSpan, getClient, getRootSpan } from '@sentry/core';
import type { Client, Transaction, TransactionSource } from '@sentry/types';
import hoistNonReactStatics from 'hoist-non-react-statics';
import * as React from 'react';

import type { ReactRouterInstrumentation } from '../types';
import { V4_SETUP_CLIENTS, V5_SETUP_CLIENTS } from './global-flags';
import { matchRoutes } from './route-utils';
import type { MatchPath, RouteConfig, RouterHistory } from './types';

let activeTransaction: Transaction | undefined;

export function reactRouterV4Instrumentation(
  history: RouterHistory,
  routes?: RouteConfig[],
  matchPath?: MatchPath,
): ReactRouterInstrumentation {
  return createReactRouterInstrumentation(history, 'react-router-v4', routes, matchPath);
}

export function reactRouterV5Instrumentation(
  history: RouterHistory,
  routes?: RouteConfig[],
  matchPath?: MatchPath,
): ReactRouterInstrumentation {
  return createReactRouterInstrumentation(history, 'react-router-v5', routes, matchPath);
}

function createReactRouterInstrumentation(
  history: RouterHistory,
  name: 'react-router-v4' | 'react-router-v5',
  allRoutes: RouteConfig[] = [],
  matchPath?: MatchPath,
): ReactRouterInstrumentation {
  function getInitPathName(): string | undefined {
    if (history && history.location) {
      return history.location.pathname;
    }

    if (WINDOW && WINDOW.location) {
      return WINDOW.location.pathname;
    }

    return undefined;
  }

  /**
   * Normalizes a transaction name. Returns the new name as well as the
   * source of the transaction.
   *
   * @param pathname The initial pathname we normalize
   */
  function normalizeTransactionName(pathname: string): [string, TransactionSource] {
    if (allRoutes.length === 0 || !matchPath) {
      return [pathname, 'url'];
    }

    const branches = matchRoutes(allRoutes, pathname, matchPath);
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let x = 0; x < branches.length; x++) {
      if (branches[x].match.isExact) {
        return [branches[x].match.path, 'route'];
      }
    }

    return [pathname, 'url'];
  }

  const tags = {
    'routing.instrumentation': name,
  };

  return (customStartTransaction, startTransactionOnPageLoad = true, startTransactionOnLocationChange = true): void => {
    const initPathName = getInitPathName();
    if (startTransactionOnPageLoad && initPathName) {
      const [name, source] = normalizeTransactionName(initPathName);
      activeTransaction = customStartTransaction({
        name,
        op: 'pageload',
        origin: 'auto.pageload.react.reactrouter',
        tags,
        metadata: {
          source,
        },
      });
    }

    if (startTransactionOnLocationChange && history.listen) {
      history.listen((location, action) => {
        if (action && (action === 'PUSH' || action === 'POP')) {
          if (activeTransaction) {
            activeTransaction.end();
          }

          const [name, source] = normalizeTransactionName(location.pathname);
          activeTransaction = customStartTransaction({
            name,
            op: 'navigation',
            origin: 'auto.navigation.react.reactrouter',
            tags,
            metadata: {
              source,
            },
          });
        }
      });
    }
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
export function withSentryRouting<P extends Record<string, any>, R extends React.ComponentType<P>>(Route: R): R {
  const componentDisplayName = (Route as any).displayName || (Route as any).name;

  const WrappedRoute: React.FC<P> = (props: P) => {
    // If we see a client has been set on the SETUP_CLIENTS weakmap, we know that the user is using the integration instead
    // of the routing instrumentation. This means we have to get the root span ourselves instead of relying on `activeTransaction`.
    const client = getClient();
    const transaction =
      V4_SETUP_CLIENTS.has(client as Client) || V5_SETUP_CLIENTS.has(client as Client)
        ? getRootSpan(getActiveSpan() as any)
        : activeTransaction;
    if (transaction && props && props.computedMatch && props.computedMatch.isExact) {
      transaction.updateName(props.computedMatch.path);
      transaction.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
    }

    // @ts-expect-error Setting more specific React Component typing for `R` generic above
    // will break advanced type inference done by react router params:
    // https://github.com/DefinitelyTyped/DefinitelyTyped/blob/13dc4235c069e25fe7ee16e11f529d909f9f3ff8/types/react-router/index.d.ts#L154-L164
    return <Route {...props} />;
  };

  WrappedRoute.displayName = `sentryRoute(${componentDisplayName})`;
  hoistNonReactStatics(WrappedRoute, Route);
  // @ts-expect-error Setting more specific React Component typing for `R` generic above
  // will break advanced type inference done by react router params:
  // https://github.com/DefinitelyTyped/DefinitelyTyped/blob/13dc4235c069e25fe7ee16e11f529d909f9f3ff8/types/react-router/index.d.ts#L154-L164
  return WrappedRoute;
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
