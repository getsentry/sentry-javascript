import * as Sentry from '@sentry/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  Navigate,
  PatchRoutesOnNavigationFunction,
  RouterProvider,
  createBrowserRouter,
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import Index from './pages/Index';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.REACT_APP_E2E_TEST_DSN,
  integrations: [
    Sentry.reactRouterV7BrowserTracingIntegration({
      useEffect: React.useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
      trackFetchStreamPerformance: true,
      enableAsyncRouteHandlers: true,
    }),
  ],
  // We recommend adjusting this value in production, or using tracesSampler
  // for finer control
  tracesSampleRate: 1.0,
  release: 'e2e-test',

  tunnel: 'http://localhost:3031',
});

const sentryCreateBrowserRouter = Sentry.wrapCreateBrowserRouterV7(createBrowserRouter);

const router = sentryCreateBrowserRouter(
  [
    {
      path: '/',
      element: <Index />,
    },
    {
      path: '/lazy',
      handle: {
        lazyChildren: () => import('./pages/InnerLazyRoutes').then(module => module.someMoreNestedRoutes),
      },
    },
    {
      path: '/another-lazy',
      handle: {
        lazyChildren: () => import('./pages/AnotherLazyRoutes').then(module => module.anotherNestedRoutes),
      },
    },
    {
      path: '/long-running',
      handle: {
        lazyChildren: () => import('./pages/LongRunningLazyRoutes').then(module => module.longRunningNestedRoutes),
      },
    },
    {
      path: '/static',
      element: <>Hello World</>,
    },
    {
      path: '*',
      element: <Navigate to="/" replace />,
    },
  ],
  {
    async patchRoutesOnNavigation({ matches, patch }: Parameters<PatchRoutesOnNavigationFunction>[0]) {
      const leafRoute = matches[matches.length - 1]?.route;
      if (leafRoute?.id && leafRoute?.handle?.lazyChildren) {
        const children = await leafRoute.handle.lazyChildren();
        patch(leafRoute.id, children);
      }
    },
  },
);

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<RouterProvider router={router} />);
