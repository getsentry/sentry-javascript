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
import Index from './pages/Index';

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

const DetailsRoutes = () => (
  <SentryRoutes>
    <Route path=":detailId" element={<div id="details">Details</div>} />
  </SentryRoutes>
);

const DetailsRoutesAlternative = () => (
  <SentryRoutes>
    <Route path=":detailId" element={<div id="details">Details</div>} />
  </SentryRoutes>
);

const ViewsRoutes = () => (
  <SentryRoutes>
    <Route index element={<div id="views">Views</div>} />
    <Route path="views/:viewId/*" element={<DetailsRoutes />} />
    <Route path="old-views/:viewId/*" element={<DetailsRoutesAlternative />} />
  </SentryRoutes>
);

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

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <BrowserRouter>
    <SentryRoutes>
      <Route path="/" element={<Index />} />
      <Route path="/*" element={<ProjectsRoutes />} />
    </SentryRoutes>
  </BrowserRouter>,
);
