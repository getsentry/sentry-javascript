import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, getActiveSpan, getRootSpan } from '@sentry/core';
import type { browserTracingIntegration as originalBrowserTracingIntegration } from '@sentry/react';
import type { BrowserClient, ErrorBoundaryProps } from '@sentry/react';
import {
  WINDOW,
  getClient,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
  withErrorBoundary,
} from '@sentry/react';
import type { Span, Transaction, TransactionContext } from '@sentry/types';
import { isNodeEnv, logger } from '@sentry/utils';
import * as React from 'react';

import { DEBUG_BUILD } from '../utils/debug-build';
import { getFutureFlagsBrowser, readRemixVersionFromLoader } from '../utils/futureFlags';

export type Params<Key extends string = string> = {
  readonly [key in Key]: string | undefined;
};

export interface RouteMatch<ParamKey extends string = string> {
  params: Params<ParamKey>;
  pathname: string;
  id: string;
  handle: unknown;
}
export type UseEffect = (cb: () => void, deps: unknown[]) => void;

export type UseLocation = () => {
  pathname: string;
  search?: string;
  hash?: string;
  state?: unknown;
  key?: unknown;
};

export type UseMatches = () => RouteMatch[] | null;

export type RemixBrowserTracingIntegrationOptions = Partial<Parameters<typeof originalBrowserTracingIntegration>[0]> & {
  useEffect?: UseEffect;
  useLocation?: UseLocation;
  useMatches?: UseMatches;
  startTransactionOnPageLoad?: boolean;
  startTransactionOnLocationChange?: boolean;
};

const DEFAULT_TAGS = {
  'routing.instrumentation': 'remix-router',
} as const;

let activeRootSpan: Span | undefined;

let _useEffect: UseEffect | undefined;
let _useLocation: UseLocation | undefined;
let _useMatches: UseMatches | undefined;

let _customStartTransaction: ((context: TransactionContext) => Span | undefined) | undefined;
let _startTransactionOnLocationChange: boolean | undefined;

function getInitPathName(): string | undefined {
  if (WINDOW && WINDOW.location) {
    return WINDOW.location.pathname;
  }

  return undefined;
}

function isRemixV2(remixVersion: number | undefined): boolean {
  return remixVersion === 2 || getFutureFlagsBrowser()?.v2_errorBoundary || false;
}

export function startPageloadSpan(): void {
  const initPathName = getInitPathName();

  if (!initPathName) {
    return;
  }

  // If _customStartTransaction is not defined, we know that we are using the browserTracingIntegration
  if (!_customStartTransaction) {
    const client = getClient<BrowserClient>();

    if (!client) {
      return;
    }

    startBrowserTracingPageLoadSpan(client, {
      name: initPathName,
      op: 'pageload',
      origin: 'auto.pageload.remix',
      tags: DEFAULT_TAGS,
      metadata: {
        source: 'url',
      },
    });

    activeRootSpan = getActiveSpan();
  } else {
    activeRootSpan = _customStartTransaction({
      name: initPathName,
      op: 'pageload',
      origin: 'auto.pageload.remix',
      tags: DEFAULT_TAGS,
      metadata: {
        source: 'url',
      },
    });
  }
}

function startNavigationSpan(matches: RouteMatch<string>[]): void {
  // If _customStartTransaction is not defined, we know that we are using the browserTracingIntegration
  if (!_customStartTransaction) {
    const client = getClient<BrowserClient>();

    if (!client) {
      return;
    }

    startBrowserTracingNavigationSpan(client, {
      name: matches[matches.length - 1].id,
      op: 'navigation',
      origin: 'auto.navigation.remix',
      tags: DEFAULT_TAGS,
      metadata: {
        source: 'route',
      },
    });

    activeRootSpan = getActiveSpan();
  } else {
    activeRootSpan = _customStartTransaction({
      name: matches[matches.length - 1].id,
      op: 'navigation',
      origin: 'auto.navigation.remix',
      tags: DEFAULT_TAGS,
      metadata: {
        source: 'route',
      },
    });
  }
}

/**
 * Creates a react-router v6 instrumention for Remix applications.
 *
 * This implementation is slightly different (and simpler) from the react-router instrumentation
 * as in Remix, `useMatches` hook is available where in react-router-v6 it's not yet.
 *
 * @deprecated Use `browserTracingIntegration` instead.
 */
export function remixRouterInstrumentation(useEffect: UseEffect, useLocation: UseLocation, useMatches: UseMatches) {
  return (
    customStartTransaction: (context: TransactionContext) => Transaction | undefined,
    startTransactionOnPageLoad = true,
    startTransactionOnLocationChange = true,
  ): void => {
    setGlobals({
      useEffect,
      useLocation,
      useMatches,
      startTransactionOnLocationChange,
      customStartTransaction,
    });

    if (startTransactionOnPageLoad) {
      startPageloadSpan();
    }
  };
}

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
    if (!_useEffect || !_useLocation || !_useMatches) {
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
      const activeRootSpan = getActiveSpan();
      if (activeRootSpan && matches && matches.length) {
        const transaction = getRootSpan(activeRootSpan);

        if (transaction) {
          transaction.updateName(matches[matches.length - 1].id);
          transaction.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
        }
      }

      isBaseLocation = true;
    }, []);

    _useEffect(() => {
      if (isBaseLocation) {
        if (activeRootSpan) {
          activeRootSpan.end();
        }

        return;
      }

      if (_startTransactionOnLocationChange && matches && matches.length) {
        if (activeRootSpan) {
          activeRootSpan.end();
        }

        startNavigationSpan(matches);
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

export function setGlobals({
  useEffect,
  useLocation,
  useMatches,
  startTransactionOnLocationChange,
  customStartTransaction,
}: {
  useEffect?: UseEffect;
  useLocation?: UseLocation;
  useMatches?: UseMatches;
  startTransactionOnLocationChange?: boolean;
  customStartTransaction?: (context: TransactionContext) => Span | undefined;
}): void {
  _useEffect = useEffect;
  _useLocation = useLocation;
  _useMatches = useMatches;
  _startTransactionOnLocationChange = startTransactionOnLocationChange;
  _customStartTransaction = customStartTransaction;
}
