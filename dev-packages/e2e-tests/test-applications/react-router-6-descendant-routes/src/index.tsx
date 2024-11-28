import * as Sentry from '@sentry/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  BrowserRouter,
  Outlet,
  Route,
  Routes,
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';

const replay = Sentry.replayIntegration();

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.REACT_APP_E2E_TEST_DSN,
  integrations: [
    Sentry.reactRouterV6BrowserTracingIntegration({
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

const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes);

const ProjectsRoutes = () => (
  <SentryRoutes>
    <Route path=":projectId" element={<div>Project Page</div>}>
      <Route index element={<div>Project Page Root</div>} />
      <Route element={<div>Editor</div>}>
        <Route path="*" element={<Outlet />}>
          <Route path="views/:viewId" element={<div>View Canvas</div>} />
        </Route>
      </Route>
    </Route>
    <Route path="*" element={<div>No Match Page</div>} />
  </SentryRoutes>
);

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <BrowserRouter>
    <SentryRoutes>
      {/* <Route index element={<Navigate to="/projects/123/views/234" />} /> */}
      <Route path="projects/*" element={<ProjectsRoutes />}></Route>
    </SentryRoutes>
  </BrowserRouter>,
);
