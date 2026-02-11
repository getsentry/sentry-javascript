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
import { hasManifest, maybeParameterizeRemixRoute } from './remixRouteParameterization';

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

/**
 * Determines the transaction name and source for a route.
 * Handles three cases:
 * 1. Dynamic routes with manifest (Vite apps): Use parameterized path with source 'route'
 * 2. Static routes with manifest (Vite apps): Use pathname with source 'url'
 * 3. Legacy apps without manifest: Use route ID with source 'route'
 */
function getTransactionNameAndSource(
  pathname: string | undefined,
  routeId: string,
): { name: string; source: 'route' | 'url' } {
  const parameterizedRoute = pathname ? maybeParameterizeRemixRoute(pathname) : undefined;

  if (parameterizedRoute) {
    // We have a parameterized route from the manifest (dynamic route)
    return { name: parameterizedRoute, source: 'route' };
  }

  if (hasManifest()) {
    // We have a manifest but no parameterization (static route)
    // Use the pathname with source 'url'
    return { name: pathname || routeId, source: 'url' };
  }

  // No manifest available (legacy app without Vite plugin)
  // Fall back to route ID for backward compatibility
  return { name: routeId, source: 'route' };
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

  const { name, source } = getTransactionNameAndSource(location.pathname, lastMatch.id);

  const spanContext: StartSpanOptions = {
    name,
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
        const { name, source } = getTransactionNameAndSource(location.pathname, lastMatch.id);

        getCurrentScope().setTransactionName(name);

        const activeRootSpan = getActiveSpan();
        if (activeRootSpan) {
          const transaction = getRootSpan(activeRootSpan);

          if (transaction) {
            transaction.updateName(name);
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
