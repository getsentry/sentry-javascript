/* eslint-disable max-lines */
// Inspired from Donnie McNeal's solution:
// https://gist.github.com/wontondon/e8c4bdf2888875e4c755712e99279536

import { browserTracingIntegration } from '@sentry/browser';
import {
  createReactRouterV6CompatibleTracingIntegration,
  createV6CompatibleWithSentryReactRouterRouting,
  createV6CompatibleWrapCreateBrowserRouter,
  createV6CompatibleWrapUseRoutes,
  ReactRouterOptions,
} from './reactrouterv6-compat-utils';

import type { CreateRouterFunction, Router, RouterState, UseRoutes } from './types';
import type { Integration } from '@sentry/core';

/**
 * A browser tracing integration that uses React Router v6 to instrument navigations.
 * Expects `useEffect`, `useLocation`, `useNavigationType`, `createRoutesFromChildren` and `matchRoutes` to be passed as options.
 */
export function reactRouterV6BrowserTracingIntegration(
  options: Parameters<typeof browserTracingIntegration>[0] & ReactRouterOptions,
): Integration {
  return createReactRouterV6CompatibleTracingIntegration(options, '6');
}

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v6 useRoutes hook.
 * This is used to automatically capture route changes as transactions when using the useRoutes hook.
 */
export function wrapUseRoutesV6(origUseRoutes: UseRoutes): UseRoutes {
  return createV6CompatibleWrapUseRoutes(origUseRoutes, '6');
}

/**
 * Alias for backwards compatibility
 * @deprecated Use `wrapUseRoutesV6` or `wrapUseRoutesV7` instead.
 */
export const wrapUseRoutes = wrapUseRoutesV6;

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v6 createBrowserRouter function.
 * This is used to automatically capture route changes as transactions when using the createBrowserRouter API.
 */
export function wrapCreateBrowserRouterV6<
  TState extends RouterState = RouterState,
  TRouter extends Router<TState> = Router<TState>,
>(createRouterFunction: CreateRouterFunction<TState, TRouter>): CreateRouterFunction<TState, TRouter> {
  return createV6CompatibleWrapCreateBrowserRouter(createRouterFunction, '6');
}

/**
 * Alias for backwards compatibility
 * @deprecated Use `wrapCreateBrowserRouterV6` or `wrapCreateBrowserRouterV7` instead.
 */
export const wrapCreateBrowserRouter = wrapCreateBrowserRouterV6;

/**
 * A higher-order component that adds Sentry routing instrumentation to a React Router v6 Route component.
 * This is used to automatically capture route changes as transactions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withSentryReactRouterV6Routing<P extends Record<string, any>, R extends React.FC<P>>(routes: R): R {
  return createV6CompatibleWithSentryReactRouterRouting<P, R>(routes, '6');
}
