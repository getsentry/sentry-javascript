import * as Sentry from '@sentry/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  Outlet,
  Route,
  RouterProvider,
  Routes,
  createBrowserRouter,
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
  useRoutes,
} from 'react-router-dom';
import Index from './pages/Index';

const replay = Sentry.replayIntegration();

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
    }),
    replay,
  ],
  // We recommend adjusting this value in production, or using tracesSampler
  // for finer control
  tracesSampleRate: 1.0,
  release: 'e2e-test',

  // Always capture replays, so we can test this properly
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 0.0,

  tunnel: 'http://localhost:3031',
});

const SentryRoutes = Sentry.withSentryReactRouterV7Routing(Routes);
const sentryUseRoutes = Sentry.wrapUseRoutesV7(useRoutes);
const sentryCreateBrowserRouter = Sentry.wrapCreateBrowserRouterV7(createBrowserRouter);

const DetailsRoutes = () =>
  sentryUseRoutes([
    {
      path: ':detailId',
      element: <div id="details">Details</div>,
    },
  ]);

const DetailsRoutesAlternative = () => (
  <SentryRoutes>
    <Route path=":detailId" element={<div id="details">Details</div>} />
  </SentryRoutes>
);

const ViewsRoutes = () =>
  sentryUseRoutes([
    {
      index: true,
      element: <div id="views">Views</div>,
    },
    {
      path: 'views/:viewId/*',
      element: <DetailsRoutes />,
    },
    {
      path: 'old-views/:viewId/*',
      element: <DetailsRoutesAlternative />,
    },
  ]);

const ProjectsRoutes = () => (
  <SentryRoutes>
    <Route path="projects" element={<Outlet />}>
      <Route index element={<div>Project Page Root</div>} />
      <Route path="*" element={<Outlet />}>
        <Route path=":projectId/*" element={<ViewsRoutes />} />
      </Route>
    </Route>
  </SentryRoutes>
);

const router = sentryCreateBrowserRouter([
  {
    path: '/post/:post',
    element: <div>Post</div>,
    children: [
      { index: true, element: <div>Post Index</div> },
      { path: '/post/:post/related', element: <div>Related Posts</div> },
    ],
  },
  {
    children: [
      {
        path: '/',
        element: <Index />,
      },
      {
        path: '/*',
        element: <ProjectsRoutes />,
      },
    ],
  },
]);

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<RouterProvider router={router} />);
