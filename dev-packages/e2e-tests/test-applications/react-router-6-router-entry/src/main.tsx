import * as Sentry from '@sentry/react';
// The `@sentry/react/router` entry pulls the required router hooks from `react-router` itself, so
// `reactRouterBrowserTracingIntegration()` needs no arguments. On React Router v6 the DOM bindings
// (`BrowserRouter`, `Link`) come from `react-router-dom`. Note this app depends only on
// `react-router-dom` (not `react-router` directly) - the entry's `react-router` import still resolves
// via the copy `react-router-dom` pulls in, which is the common real-world v6 setup.
import { reactRouterBrowserTracingIntegration, wrapReactRouterRouting } from '@sentry/react/router';
import * as React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Index from './pages/Index';
import Products from './pages/Products';
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
      <Route path="/products" element={<Products />} />
    </SentryRoutes>
  </BrowserRouter>,
);
