import { type ErrorBoundaryProps, getCurrentScope } from '@sentry/react';
import { WINDOW, withErrorBoundary } from '@sentry/react';
import type { PropagationContext, TraceparentData, Transaction, TransactionContext } from '@sentry/types';
import { isNodeEnv, logger, tracingContextFromHeaders } from '@sentry/utils';
import * as React from 'react';

import { DEBUG_BUILD } from '../utils/debug-build';
import { getFutureFlagsBrowser, readRemixVersionFromLoader } from '../utils/futureFlags';

const DEFAULT_TAGS = {
  'routing.instrumentation': 'remix-router',
} as const;

type Params<Key extends string = string> = {
  readonly [key in Key]: string | undefined;
};

interface RouteMatch<ParamKey extends string = string> {
  params: Params<ParamKey>;
  pathname: string;
  id: string;
  handle: unknown;
  data?: {
    sentryTrace?: string;
    sentryBaggage?: string;
  };
}

type UseEffect = (cb: () => void, deps: unknown[]) => void;
type UseLocation = () => {
  pathname: string;
  search?: string;
  hash?: string;
  state?: unknown;
  key?: unknown;
};
type UseMatches = () => RouteMatch[] | null;

let activeTransaction: Transaction | undefined;

let _useEffect: UseEffect;
let _useLocation: UseLocation;
let _useMatches: UseMatches;

let _customStartTransaction: (context: TransactionContext) => Transaction | undefined;
let _startTransactionOnLocationChange: boolean;

function getInitPathName(): string | undefined {
  if (WINDOW && WINDOW.location) {
    return WINDOW.location.pathname;
  }

  return undefined;
}

function isRemixV2(remixVersion: number | undefined): boolean {
  return remixVersion === 2 || getFutureFlagsBrowser()?.v2_errorBoundary || false;
}

/**
 * Creates a react-router v6 instrumention for Remix applications.
 *
 * This implementation is slightly different (and simpler) from the react-router instrumentation
 * as in Remix, `useMatches` hook is available where in react-router-v6 it's not yet.
 */
export function remixRouterInstrumentation(useEffect: UseEffect, useLocation: UseLocation, useMatches: UseMatches) {
  return (
    customStartTransaction: (context: TransactionContext) => Transaction | undefined,
    startTransactionOnPageLoad = true,
    startTransactionOnLocationChange = true,
  ): void => {
    const initPathName = getInitPathName();

    if (startTransactionOnPageLoad && initPathName) {
      activeTransaction = customStartTransaction({
        name: initPathName,
        op: 'pageload',
        origin: 'auto.pageload.remix',
        tags: DEFAULT_TAGS,
        metadata: {
          source: 'url',
        },
      });
    }

    _useEffect = useEffect;
    _useLocation = useLocation;
    _useMatches = useMatches;

    _customStartTransaction = customStartTransaction;
    _startTransactionOnLocationChange = startTransactionOnLocationChange;
  };
}

const getTracingContextFromRouteMatches = (
  currentRouteMatch: RouteMatch<string>,
): {
  traceparentData?: TraceparentData;
  dynamicSamplingContext?: Record<string, unknown>;
  propagationContext: PropagationContext;
} => {
  const { sentryTrace, sentryBaggage } = currentRouteMatch.data || {};

  return tracingContextFromHeaders(sentryTrace, sentryBaggage);
};

const updatePageLoadTransaction = (transaction: Transaction, currentRouteMatch: RouteMatch<string>): Transaction => {
  const { traceparentData, dynamicSamplingContext, propagationContext } =
    getTracingContextFromRouteMatches(currentRouteMatch);

  getCurrentScope().setPropagationContext(propagationContext);

  transaction.updateName(currentRouteMatch.id);
  transaction.setMetadata({
    source: 'route',
    dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
  });

  transaction.parentSpanId = traceparentData?.parentSpanId;
  transaction.parentSampled = traceparentData?.parentSampled;

  if (traceparentData?.traceId) {
    transaction.traceId = traceparentData.traceId;
  }

  return transaction;
};

const startNavigationTransaction = (currentRouteMatch: RouteMatch<string>): Transaction | undefined => {
  const { traceparentData, dynamicSamplingContext, propagationContext } =
    getTracingContextFromRouteMatches(currentRouteMatch);

  getCurrentScope().setPropagationContext(propagationContext);

  return _customStartTransaction({
    name: currentRouteMatch.id,
    op: 'navigation',
    origin: 'auto.navigation.remix',
    tags: DEFAULT_TAGS,
    metadata: {
      source: 'route',
      dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
    },
  });
};

/**
 * Wraps a remix `root` (see: https://remix.run/docs/en/v1/guides/migrating-react-router-app#creating-the-root-route)
 * To enable pageload/navigation tracing on every route.
 * Also wraps the application with `ErrorBoundary`.
 *
 * @param OrigApp The Remix root to wrap
 * @param options The options for ErrorBoundary wrapper.
 */
export function withSentry<P extends Record<string, unknown>, R extends React.ComponentType<P>>(
  OrigApp: R,
  options: {
    wrapWithErrorBoundary?: boolean;
    errorBoundaryOptions?: ErrorBoundaryProps;
  } = {
    // We don't want to wrap application with Sentry's ErrorBoundary by default for Remix v2
    wrapWithErrorBoundary: true,
    errorBoundaryOptions: {},
  },
): R {
  const SentryRoot: React.FC<P> = (props: P) => {
    // Early return when any of the required functions is not available.
    if (!_useEffect || !_useLocation || !_useMatches || !_customStartTransaction) {
      DEBUG_BUILD &&
        !isNodeEnv() &&
        logger.warn('Remix SDK was unable to wrap your root because of one or more missing parameters.');

      // @ts-expect-error Setting more specific React Component typing for `R` generic above
      // will break advanced type inference done by react router params
      return <OrigApp {...props} />;
    }

    let isBaseLocation: boolean = false;

    const location = _useLocation();
    const matches = _useMatches();

    _useEffect(() => {
      if (activeTransaction && matches && matches.length) {
        const currentRouteMatch = matches[matches.length - 1];

        activeTransaction = updatePageLoadTransaction(activeTransaction, currentRouteMatch);
      }

      isBaseLocation = true;
    }, []);

    _useEffect(() => {
      if (isBaseLocation) {
        if (activeTransaction) {
          activeTransaction.end();
        }

        return;
      }

      if (_startTransactionOnLocationChange && matches && matches.length) {
        if (activeTransaction) {
          activeTransaction.end();
        }

        const currentRouteMatch = matches[matches.length - 1];

        activeTransaction = startNavigationTransaction(currentRouteMatch);
      }
    }, [location]);

    isBaseLocation = false;

    if (!isRemixV2(readRemixVersionFromLoader()) && options.wrapWithErrorBoundary) {
      // @ts-expect-error Setting more specific React Component typing for `R` generic above
      // will break advanced type inference done by react router params
      return withErrorBoundary(OrigApp, options.errorBoundaryOptions)(props);
    }
    // @ts-expect-error Setting more specific React Component typing for `R` generic above
    // will break advanced type inference done by react router params
    return <OrigApp {...props} />;
  };

  // @ts-expect-error Setting more specific React Component typing for `R` generic above
  // will break advanced type inference done by react router params
  return SentryRoot;
}
