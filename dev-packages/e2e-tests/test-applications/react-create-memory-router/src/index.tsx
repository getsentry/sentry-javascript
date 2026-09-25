import * as Sentry from '@sentry/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  RouterProvider,
  createMemoryRouter,
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

const sentryCreateMemoryRouter = Sentry.wrapCreateMemoryRouterV6(createMemoryRouter);

const router = sentryCreateMemoryRouter(
  [
    {
      path: '/',
      element: <Index />,
    },
    {
      path: '/user/:id',
      element: <User />,
    },
  ],
  {
    initialEntries: ['/', '/user/1', '/user/2'],
    initialIndex: 2,
  },
);

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(<RouterProvider router={router} />);
