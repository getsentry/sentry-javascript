import type { browserTracingIntegration } from '@sentry/browser';
import type { Integration } from '@sentry/core';
import type { ReactRouterOptions } from './reactrouter-compat-utils';
import {
  createReactRouterV6CompatibleTracingIntegration,
  createV6CompatibleWithSentryReactRouterRouting,
  createV6CompatibleWrapCreateBrowserRouter,
  createV6CompatibleWrapCreateMemoryRouter,
  createV6CompatibleWrapUseRoutes,
} from './reactrouter-compat-utils';
import type { CreateRouterFunction, Router, RouterState, UseRoutes } from './types';

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
 * A wrapper function that adds Sentry routing instrumentation to a React Router v6 createMemoryRouter function.
 * This is used to automatically capture route changes as transactions when using the createMemoryRouter API.
 * The difference between createBrowserRouter and createMemoryRouter is that with createMemoryRouter,
 * optional `initialEntries` are also taken into account.
 */
export function wrapCreateMemoryRouterV6<
  TState extends RouterState = RouterState,
  TRouter extends Router<TState> = Router<TState>,
>(createMemoryRouterFunction: CreateRouterFunction<TState, TRouter>): CreateRouterFunction<TState, TRouter> {
  return createV6CompatibleWrapCreateMemoryRouter(createMemoryRouterFunction, '6');
}

/**
 * A higher-order component that adds Sentry routing instrumentation to a React Router v6 Route component.
 * This is used to automatically capture route changes as transactions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withSentryReactRouterV6Routing<P extends Record<string, any>, R extends React.FC<P>>(routes: R): R {
  return createV6CompatibleWithSentryReactRouterRouting<P, R>(routes, '6');
}
