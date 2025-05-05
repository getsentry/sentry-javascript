import type { Client, StartSpanOptions } from '@sentry/core';
import {
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  isNodeEnv,
  logger,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import type { BrowserClient, browserTracingIntegration as originalBrowserTracingIntegration } from '@sentry/react';
import { getClient, startBrowserTracingNavigationSpan, startBrowserTracingPageLoadSpan, WINDOW } from '@sentry/react';
import * as React from 'react';
import { DEBUG_BUILD } from '../utils/debug-build';

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
};

let _useEffect: UseEffect | undefined;
let _useLocation: UseLocation | undefined;
let _useMatches: UseMatches | undefined;

let _instrumentNavigation: boolean | undefined;

function getInitPathName(): string | undefined {
  if (WINDOW.location) {
    return WINDOW.location.pathname;
  }

  return undefined;
}

export function startPageloadSpan(client: Client): void {
  const initPathName = getInitPathName();

  if (!initPathName) {
    return;
  }

  const spanContext: StartSpanOptions = {
    name: initPathName,
    op: 'pageload',
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.remix',
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
    },
  };

  startBrowserTracingPageLoadSpan(client, spanContext);
}

function startNavigationSpan(matches: RouteMatch<string>[]): void {
  const lastMatch = matches[matches.length - 1];

  const client = getClient<BrowserClient>();

  if (!client || !lastMatch) {
    return;
  }

  const spanContext: StartSpanOptions = {
    name: lastMatch.id,
    op: 'navigation',
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.remix',
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
    },
  };

  startBrowserTracingNavigationSpan(client, spanContext);
}

/**
 * Wraps a remix `root` (see: https://remix.run/docs/en/main/start/quickstart#the-root-route)
 * To enable pageload/navigation tracing on every route.
 *
 * @param OrigApp The Remix root to wrap
 * @param useEffect The `useEffect` hook from `react`
 * @param useLocation The `useLocation` hook from `@remix-run/react`
 * @param useMatches The `useMatches` hook from `@remix-run/react`
 * @param instrumentNavigation Whether to instrument navigation spans. Defaults to `true`.
 */
export function withSentry<P extends Record<string, unknown>, R extends React.ComponentType<P>>(
  OrigApp: R,
  useEffect?: UseEffect,
  useLocation?: UseLocation,
  useMatches?: UseMatches,
  instrumentNavigation?: boolean,
): R {
  const SentryRoot: React.FC<P> = (props: P) => {
    setGlobals({ useEffect, useLocation, useMatches, instrumentNavigation: instrumentNavigation || true });

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
      const lastMatch = matches && matches[matches.length - 1];
      if (lastMatch) {
        const routeName = lastMatch.id;
        getCurrentScope().setTransactionName(routeName);

        const activeRootSpan = getActiveSpan();
        if (activeRootSpan) {
          const transaction = getRootSpan(activeRootSpan);

          if (transaction) {
            transaction.updateName(routeName);
            transaction.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
          }
        }
      }

      isBaseLocation = true;
    }, []);

    _useEffect(() => {
      const activeRootSpan = getActiveSpan();

      if (isBaseLocation) {
        if (activeRootSpan) {
          activeRootSpan.end();
        }

        return;
      }

      if (_instrumentNavigation && matches?.length) {
        if (activeRootSpan) {
          activeRootSpan.end();
        }

        startNavigationSpan(matches);
      }
    }, [location]);

    isBaseLocation = false;

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
  instrumentNavigation,
}: {
  useEffect?: UseEffect;
  useLocation?: UseLocation;
  useMatches?: UseMatches;
  instrumentNavigation?: boolean;
}): void {
  _useEffect = useEffect || _useEffect;
  _useLocation = useLocation || _useLocation;
  _useMatches = useMatches || _useMatches;
  _instrumentNavigation = instrumentNavigation ?? _instrumentNavigation;
}
