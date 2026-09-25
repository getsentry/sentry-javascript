import * as Sentry from '@sentry/react';
import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import {
  RouterProvider,
  createBrowserRouter,
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import Index from './pages/Index';
import User from './pages/User';

const replay = Sentry.replayIntegration();

Sentry.init({
  // environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.REACT_APP_E2E_TEST_DSN,
  integrations: [
    Sentry.reactRouterV6BrowserTracingIntegration({
      useEffect: React.useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
    }),
    replay,
  ],
  // We recommend adjusting this value in production, or using tracesSampler
  // for finer control
  tracesSampleRate: 1.0,
  release: 'e2e-test',

  tunnel: 'http://localhost:3031',

  // Always capture replays, so we can test this properly
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 0.0,

  debug: !!process.env.DEBUG,
});

const sentryCreateBrowserRouter = Sentry.wrapCreateBrowserRouterV6(createBrowserRouter);
const LazyLoadedUser = lazy(() => import('./pages/LazyLoadedUser'));

const router = sentryCreateBrowserRouter(
  [
    {
      path: '/',
      element: <Index />,
    },
    {
      path: '/lazy-loaded-user/*',
      element: (
        <Suspense fallback={<div>Loading...</div>}>
          <LazyLoadedUser />
        </Suspense>
      ),
    },
    {
      path: '/user/:id',
      element: <User />,
    },
  ],
  {
    // We're testing whether this option is avoided in the integration
    // We expect this to be ignored
    initialEntries: ['/user/1'],
  },
);

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(<RouterProvider router={router} />);
