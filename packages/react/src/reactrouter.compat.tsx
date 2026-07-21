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
 * A browser tracing integration that uses React Router to instrument navigations.
 * Expects `useEffect`, `useLocation`, `useNavigationType`, `createRoutesFromChildren` and `matchRoutes` to be passed as options.
 *
 * Works with React Router v6+.
 */
export function reactRouterBrowserTracingIntegration(
  options: Parameters<typeof browserTracingIntegration>[0] & ReactRouterOptions,
): Integration {
  return createReactRouterV6CompatibleTracingIntegration(options, '');
}

/**
 * A higher-order component that adds Sentry routing instrumentation to a React Router Route component.
 * This is used to automatically capture route changes as transactions.
 *
 * Works with React Router v6+.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapReactRouterRouting<P extends Record<string, any>, R extends React.FC<P>>(routes: R): R {
  return createV6CompatibleWithSentryReactRouterRouting<P, R>(routes, '');
}

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router createBrowserRouter function.
 * This is used to automatically capture route changes as transactions when using the createBrowserRouter API.
 *
 * Works with React Router v6+.
 */
export function wrapCreateBrowserRouter<
  TState extends RouterState = RouterState,
  TRouter extends Router<TState> = Router<TState>,
>(createRouterFunction: CreateRouterFunction<TState, TRouter>): CreateRouterFunction<TState, TRouter> {
  return createV6CompatibleWrapCreateBrowserRouter(createRouterFunction, '');
}

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router createMemoryRouter function.
 * This is used to automatically capture route changes as transactions when using the createMemoryRouter API.
 * The difference between createBrowserRouter and createMemoryRouter is that with createMemoryRouter,
 * optional `initialEntries` are also taken into account.
 *
 * Works with React Router v6+.
 */
export function wrapCreateMemoryRouter<
  TState extends RouterState = RouterState,
  TRouter extends Router<TState> = Router<TState>,
>(createMemoryRouterFunction: CreateRouterFunction<TState, TRouter>): CreateRouterFunction<TState, TRouter> {
  return createV6CompatibleWrapCreateMemoryRouter(createMemoryRouterFunction, '');
}

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router useRoutes hook.
 * This is used to automatically capture route changes as transactions when using the useRoutes hook.
 *
 * Works with React Router v6+.
 */
export function wrapUseRoutes(origUseRoutes: UseRoutes): UseRoutes {
  return createV6CompatibleWrapUseRoutes(origUseRoutes, '');
}
