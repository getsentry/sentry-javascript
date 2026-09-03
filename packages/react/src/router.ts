import type { browserTracingIntegration } from '@sentry/browser';
import type { Integration } from '@sentry/core';
import type * as React from 'react';
import { createRoutesFromChildren, matchRoutes, useLocation, useNavigationType } from 'react-router';
import type { ReactRouterOptions } from './reactrouter-compat-utils';
import {
  reactRouterBrowserTracingIntegration as reactRouterBrowserTracingIntegrationBase,
  wrapCreateBrowserRouter as wrapCreateBrowserRouterBase,
  wrapCreateMemoryRouter as wrapCreateMemoryRouterBase,
  wrapReactRouterRouting as wrapReactRouterRoutingBase,
  wrapUseRoutes as wrapUseRoutesBase,
} from './reactrouter.compat';
import type { CreateRouterFunction, Router, RouterState, UseRoutes } from './types';

type BrowserTracingOptions = Parameters<typeof browserTracingIntegration>[0];

/**
 * The React Router hooks pulled from the `react-router` package, supplied by default to the routing
 * wrappers exported from this entry point so consumers do not have to pass them in themselves.
 */
const routerHooks = { useLocation, useNavigationType, createRoutesFromChildren, matchRoutes };

/**
 * A browser tracing integration for React Router v6, v7 and v8.
 *
 * Unlike {@link reactRouterBrowserTracingIntegration} exported from `@sentry/react`, this variant pulls the
 * required router hooks (`useLocation`, `useNavigationType`, `createRoutesFromChildren` and `matchRoutes`)
 * directly from `react-router`, so you don't have to pass them in:
 *
 * ```ts
 * import { reactRouterBrowserTracingIntegration } from '@sentry/react/router';
 *
 * Sentry.init({ integrations: [reactRouterBrowserTracingIntegration()] });
 * ```
 *
 * Any of the hooks can still be overridden via `options` (e.g. to supply the `react-router-dom` versions).
 *
 * This requires `react-router` to be resolvable (it is declared as an optional peer dependency). If you are on
 * React Router v6 with only `react-router-dom` installed, either add `react-router` as a dependency or import
 * `reactRouterBrowserTracingIntegration` from `@sentry/react` and pass the hooks explicitly.
 */
export function reactRouterBrowserTracingIntegration(
  options: BrowserTracingOptions & Partial<ReactRouterOptions> = {},
): Integration {
  return reactRouterBrowserTracingIntegrationBase({
    ...routerHooks,
    ...options,
  });
}

/**
 * Like {@link wrapReactRouterRouting} from `@sentry/react`, but the required React Router hooks are pulled
 * from `react-router` and supplied as defaults, so you do not have to pass them in.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapReactRouterRouting<P extends Record<string, any>, R extends React.FC<P>>(routes: R): R {
  return wrapReactRouterRoutingBase<P, R>(routes, routerHooks);
}

/**
 * Like {@link wrapCreateBrowserRouter} from `@sentry/react`, but the required React Router hooks are pulled
 * from `react-router` and supplied as defaults, so you do not have to pass them in.
 */
export function wrapCreateBrowserRouter<
  TState extends RouterState = RouterState,
  TRouter extends Router<TState> = Router<TState>,
>(createRouterFunction: CreateRouterFunction<TState, TRouter>): CreateRouterFunction<TState, TRouter> {
  return wrapCreateBrowserRouterBase(createRouterFunction, routerHooks);
}

/**
 * Like {@link wrapCreateMemoryRouter} from `@sentry/react`, but the required React Router hooks are pulled
 * from `react-router` and supplied as defaults, so you do not have to pass them in.
 */
export function wrapCreateMemoryRouter<
  TState extends RouterState = RouterState,
  TRouter extends Router<TState> = Router<TState>,
>(createMemoryRouterFunction: CreateRouterFunction<TState, TRouter>): CreateRouterFunction<TState, TRouter> {
  return wrapCreateMemoryRouterBase(createMemoryRouterFunction, routerHooks);
}

/**
 * Like {@link wrapUseRoutes} from `@sentry/react`, but the required React Router hooks are pulled from
 * `react-router` and supplied as defaults, so you do not have to pass them in.
 */
export function wrapUseRoutes(origUseRoutes: UseRoutes): UseRoutes {
  return wrapUseRoutesBase(origUseRoutes, routerHooks);
}
