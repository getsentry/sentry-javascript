import type { Client, StartSpanOptions } from '@sentry/core';
import {
  debug,
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  isNodeEnv,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import type { BrowserClient, browserTracingIntegration as originalBrowserTracingIntegration } from '@sentry/react';
import { getClient, startBrowserTracingNavigationSpan, startBrowserTracingPageLoadSpan, WINDOW } from '@sentry/react';
import * as React from 'react';
import { DEBUG_BUILD } from '../utils/debug-build';
import { maybeParameterizeRemixRoute } from './remixRouteParameterization';

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

  // Try to parameterize the route using the route manifest
  const parameterizedRoute = maybeParameterizeRemixRoute(initPathName);
  const spanName = parameterizedRoute || initPathName;
  const source = parameterizedRoute ? 'route' : 'url';

  const spanContext: StartSpanOptions = {
    name: spanName,
    op: 'pageload',
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.remix',
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
    },
  };

  startBrowserTracingPageLoadSpan(client, spanContext);
}

function startNavigationSpan(matches: RouteMatch<string>[], location: ReturnType<UseLocation>): void {
  const lastMatch = matches[matches.length - 1];

  const client = getClient<BrowserClient>();

  if (!client || !lastMatch) {
    return;
  }

  // Try to parameterize the route using the manifest
  const pathname = location.pathname;
  const parameterizedRoute = pathname ? maybeParameterizeRemixRoute(pathname) : undefined;
  const spanName = parameterizedRoute || lastMatch.id;
  // Note: We use 'route' even when falling back to lastMatch.id because Remix route IDs are still route-based
  const source = 'route';

  const spanContext: StartSpanOptions = {
    name: spanName,
    op: 'navigation',
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.remix',
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
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
        debug.warn('Remix SDK was unable to wrap your root because of one or more missing parameters.');

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
        // Try to parameterize the route using the manifest
        const pathname = location.pathname;
        const parameterizedRoute = pathname ? maybeParameterizeRemixRoute(pathname) : undefined;

        // If we have a parameterized route from the manifest, use it
        // Otherwise, fall back to the route ID for backward compatibility
        const routeName = parameterizedRoute || lastMatch.id;
        const source = 'route';

        getCurrentScope().setTransactionName(routeName);

        const activeRootSpan = getActiveSpan();
        if (activeRootSpan) {
          const transaction = getRootSpan(activeRootSpan);

          if (transaction) {
            transaction.updateName(routeName);
            transaction.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source);
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

        startNavigationSpan(matches, location);
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
