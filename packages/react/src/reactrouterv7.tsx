// React Router v7 uses the same integration as v6
import type { browserTracingIntegration } from '@sentry/browser';
import type { Integration } from '@sentry/core';
import type { ReactRouterOptions } from './reactrouterv6-compat-utils';
import {
  createReactRouterV6CompatibleTracingIntegration,
  createV6CompatibleWithSentryReactRouterRouting,
  createV6CompatibleWrapCreateBrowserRouter,
  createV6CompatibleWrapUseRoutes,
} from './reactrouterv6-compat-utils';
import type { CreateRouterFunction, Router, RouterState, UseRoutes } from './types';

/**
 * A browser tracing integration that uses React Router v7 to instrument navigations.
 * Expects `useEffect`, `useLocation`, `useNavigationType`, `createRoutesFromChildren` and `matchRoutes` to be passed as options.
 */
export function reactRouterV7BrowserTracingIntegration(
  options: Parameters<typeof browserTracingIntegration>[0] & ReactRouterOptions,
): Integration {
  return createReactRouterV6CompatibleTracingIntegration(options, '7');
}

/**
 * A higher-order component that adds Sentry routing instrumentation to a React Router v7 Route component.
 * This is used to automatically capture route changes as transactions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withSentryReactRouterV7Routing<P extends Record<string, any>, R extends React.FC<P>>(routes: R): R {
  return createV6CompatibleWithSentryReactRouterRouting<P, R>(routes, '7');
}

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v7 createBrowserRouter function.
 * This is used to automatically capture route changes as transactions when using the createBrowserRouter API.
 */
export function wrapCreateBrowserRouterV7<
  TState extends RouterState = RouterState,
  TRouter extends Router<TState> = Router<TState>,
>(createRouterFunction: CreateRouterFunction<TState, TRouter>): CreateRouterFunction<TState, TRouter> {
  return createV6CompatibleWrapCreateBrowserRouter(createRouterFunction, '7');
}

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v7 useRoutes hook.
 * This is used to automatically capture route changes as transactions when using the useRoutes hook.
 */
export function wrapUseRoutesV7(origUseRoutes: UseRoutes): UseRoutes {
  return createV6CompatibleWrapUseRoutes(origUseRoutes, '7');
}
