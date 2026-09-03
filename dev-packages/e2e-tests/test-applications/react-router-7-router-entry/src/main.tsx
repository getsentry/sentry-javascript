import * as Sentry from '@sentry/react';
// The `@sentry/react/router` entry pulls the required router hooks from `react-router` itself, so
// unlike `@sentry/react` it does not require passing `useLocation`/`useNavigationType`/`matchRoutes`/
// `createRoutesFromChildren` to the integration.
import { reactRouterBrowserTracingIntegration, wrapReactRouterRouting } from '@sentry/react/router';
import * as React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import Index from './pages/Index';
import User from './pages/User';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: import.meta.env.PUBLIC_E2E_TEST_DSN,
  integrations: [reactRouterBrowserTracingIntegration()],
  tracesSampleRate: 1.0,
  release: 'e2e-test',
  tunnel: 'http://localhost:3031',
});

const SentryRoutes = wrapReactRouterRouting(Routes);

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <BrowserRouter>
    <SentryRoutes>
      <Route path="/" element={<Index />} />
      <Route path="/user/:id" element={<User />} />
    </SentryRoutes>
  </BrowserRouter>,
);
