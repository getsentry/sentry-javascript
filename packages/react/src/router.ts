import type { browserTracingIntegration } from '@sentry/browser';
import type { Integration } from '@sentry/core';
import { createRoutesFromChildren, matchRoutes, useLocation, useNavigationType } from 'react-router';
import type { ReactRouterOptions } from './reactrouter-compat-utils';
import { reactRouterBrowserTracingIntegration as reactRouterBrowserTracingIntegrationBase } from './reactrouter.compat';

export {
  wrapReactRouterRouting,
  wrapCreateBrowserRouter,
  wrapCreateMemoryRouter,
  wrapUseRoutes,
} from './reactrouter.compat';

type BrowserTracingOptions = Parameters<typeof browserTracingIntegration>[0];

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
    useLocation,
    useNavigationType,
    createRoutesFromChildren,
    matchRoutes,
    ...options,
  });
}
