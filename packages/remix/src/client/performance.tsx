import { ErrorBoundaryProps, getCurrentScope } from '@sentry/react';
import { withErrorBoundary } from '@sentry/react';
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
let _startTransactionOnPageLoad: boolean;
let _startTransactionOnLocationChange: boolean;

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
    _useEffect = useEffect;
    _useLocation = useLocation;
    _useMatches = useMatches;

    _customStartTransaction = customStartTransaction;
    _startTransactionOnPageLoad = startTransactionOnPageLoad;
    _startTransactionOnLocationChange = startTransactionOnLocationChange;
  };
}

const getTracingContextFromRouteMatches = (
  matches: RouteMatch<string>[],
): {
  traceparentData?: TraceparentData;
  dynamicSamplingContext?: Record<string, unknown>;
  propagationContext: PropagationContext;
  id: string;
} => {
  const currentRouteMatch = matches[matches.length - 1];

  const { sentryTrace, sentryBaggage } = currentRouteMatch.data || {};

  return { id: currentRouteMatch.id, ...tracingContextFromHeaders(sentryTrace, sentryBaggage) };
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
      if (matches && matches.length) {
        const { id, traceparentData, dynamicSamplingContext, propagationContext } =
          getTracingContextFromRouteMatches(matches);

        getCurrentScope().setPropagationContext(propagationContext);

        if (_startTransactionOnPageLoad) {
          activeTransaction = _customStartTransaction({
            name: id,
            op: 'pageload',
            origin: 'auto.pageload.remix',
            tags: DEFAULT_TAGS,
            ...traceparentData,
            metadata: {
              source: 'url',
              dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
            },
          });
        }
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

        const { id, traceparentData, dynamicSamplingContext, propagationContext } =
          getTracingContextFromRouteMatches(matches);

        getCurrentScope().setPropagationContext(propagationContext);

        activeTransaction = _customStartTransaction({
          name: id,
          op: 'navigation',
          origin: 'auto.navigation.remix',
          tags: DEFAULT_TAGS,
          ...traceparentData,
          metadata: {
            source: 'route',
            dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
          },
        });
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
