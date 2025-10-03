import * as Sentry from '@sentry/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  RouterProvider,
  createHashRouter,
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import Index from './pages/Index';
import User from './pages/User';
import Group from './pages/Group';
import Post from './pages/Post';
import PostFeatured from './pages/PostFeatured';
import PostRelated from './pages/PostRelated';
import PostIndex from './pages/PostIndex';

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

const sentryCreateHashRouter = Sentry.wrapCreateBrowserRouterV6(createHashRouter);

const router = sentryCreateHashRouter([
  {
    path: '/',
    element: <Index />,
  },
  {
    path: '/user/:id',
    element: <User />,
  },
  {
    path: '/group/:group/:user?',
    element: <Group />,
  },
  {
    path: '/v2/post/:post',
    element: <Post />,
    children: [
      { index: true, element: <PostIndex /> },
      {
        path: 'featured',
        element: <PostFeatured />,
      },
      {
        path: '/v2/post/:post/related',
        element: <PostRelated />,
      },
    ],
  },
]);

console.log(router.routes);

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(<RouterProvider router={router} />);
