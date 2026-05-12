import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  BrowserRouter,
  Route,
  Routes,
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router';
import Index from './pages/Index';
import SSE from './pages/SSE';
import User from './pages/User';

const lighthouseMode = import.meta.env.PUBLIC_SENTRY_LIGHTHOUSE_MODE;

let SentryRoutes = Routes;

(async () => {
  if (lighthouseMode !== 'no-sentry') {
    const Sentry = await import('@sentry/react');

    const integrations: Sentry.Integration[] = [];

    if (lighthouseMode !== 'init-only') {
      integrations.push(
        Sentry.reactRouterV7BrowserTracingIntegration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
          trackFetchStreamPerformance: true,
        }),
        Sentry.replayIntegration(),
      );
    }

    Sentry.init({
      environment: 'qa', // dynamic sampling bias to keep transactions
      dsn: import.meta.env.PUBLIC_E2E_TEST_DSN,
      integrations,
      tracesSampleRate: 1.0,
      release: 'e2e-test',
      replaysSessionSampleRate: lighthouseMode !== 'init-only' ? 1.0 : 0.0,
      replaysOnErrorSampleRate: 0.0,
      tunnel: 'http://localhost:3031',
      sendDefaultPii: true,
    });

    SentryRoutes = Sentry.withSentryReactRouterV7Routing(Routes);
  }

  const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
  root.render(
    <BrowserRouter>
      <SentryRoutes>
        <Route path="/" element={<Index />} />
        <Route path="/user/:id" element={<User />} />
        <Route path="/sse" element={<SSE />} />
      </SentryRoutes>
    </BrowserRouter>,
  );
})();
