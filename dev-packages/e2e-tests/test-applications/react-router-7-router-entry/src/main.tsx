import * as Sentry from '@sentry/react';
import { reactRouterBrowserTracingIntegration } from '@sentry/react/router';
import * as React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route } from 'react-router';
// Importing this evaluates `sentry-routes.tsx` (which calls `wrapReactRouterRouting`) BEFORE the
// `Sentry.init()` call below runs - i.e. the routes are wrapped before Sentry is initialized.
import { SentryRoutes } from './sentry-routes';
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
