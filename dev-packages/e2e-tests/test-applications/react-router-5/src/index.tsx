import * as Sentry from '@sentry/react';
import { createBrowserHistory } from 'history';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Route, Router, Switch } from 'react-router-dom';
import Index from './pages/Index';
import User from './pages/User';

const replay = Sentry.replayIntegration();

const history = createBrowserHistory();

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn:
    process.env.REACT_APP_E2E_TEST_DSN ||
    'https://3b6c388182fb435097f41d181be2b2ba@o4504321058471936.ingest.sentry.io/4504321066008576',
  integrations: [Sentry.reactRouterV5BrowserTracingIntegration({ history }), replay],
  // We recommend adjusting this value in production, or using tracesSampler
  // for finer control
  tracesSampleRate: 1.0,
  release: 'e2e-test',
  tunnel: 'http://localhost:3031/', // proxy server

  // Always capture replays, so we can test this properly
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 0.0,
});

// Create Custom Sentry Route component
export const SentryRoute = Sentry.withSentryRouting(Route);

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <Router history={history}>
    <Switch>
      <SentryRoute path="/user/:id" component={User} />
      <SentryRoute path="/" component={Index} />
    </Switch>
  </Router>,
);
