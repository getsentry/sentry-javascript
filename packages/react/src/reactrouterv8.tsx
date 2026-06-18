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
 * A browser tracing integration that uses React Router v8 to instrument navigations.
 * Expects `useEffect`, `useLocation`, `useNavigationType`, `createRoutesFromChildren` and `matchRoutes` to be passed as options.
 */
export function reactRouterV8BrowserTracingIntegration(
  options: Parameters<typeof browserTracingIntegration>[0] & ReactRouterOptions,
): Integration {
  return createReactRouterV6CompatibleTracingIntegration(options, '8');
}

/**
 * A higher-order component that adds Sentry routing instrumentation to a React Router v8 Route component.
 * This is used to automatically capture route changes as transactions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withSentryReactRouterV8Routing<P extends Record<string, any>, R extends React.FC<P>>(routes: R): R {
  return createV6CompatibleWithSentryReactRouterRouting<P, R>(routes, '8');
}

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v8 createBrowserRouter function.
 * This is used to automatically capture route changes as transactions when using the createBrowserRouter API.
 */
export function wrapCreateBrowserRouterV8<
  TState extends RouterState = RouterState,
  TRouter extends Router<TState> = Router<TState>,
>(createRouterFunction: CreateRouterFunction<TState, TRouter>): CreateRouterFunction<TState, TRouter> {
  return createV6CompatibleWrapCreateBrowserRouter(createRouterFunction, '8');
}

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v8 createMemoryRouter function.
 * This is used to automatically capture route changes as transactions when using the createMemoryRouter API.
 * The difference between createBrowserRouter and createMemoryRouter is that with createMemoryRouter,
 * optional `initialEntries` are also taken into account.
 */
export function wrapCreateMemoryRouterV8<
  TState extends RouterState = RouterState,
  TRouter extends Router<TState> = Router<TState>,
>(createMemoryRouterFunction: CreateRouterFunction<TState, TRouter>): CreateRouterFunction<TState, TRouter> {
  return createV6CompatibleWrapCreateMemoryRouter(createMemoryRouterFunction, '8');
}

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v8 useRoutes hook.
 * This is used to automatically capture route changes as transactions when using the useRoutes hook.
 */
export function wrapUseRoutesV8(origUseRoutes: UseRoutes): UseRoutes {
  return createV6CompatibleWrapUseRoutes(origUseRoutes, '8');
}
