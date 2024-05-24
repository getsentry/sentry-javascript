import * as Sentry from '@sentry/react';
// biome-ignore lint/nursery/noUnusedImports: <explanation>
import React from 'react';
import ReactDOM from 'react-dom/client';
import Index from './pages/Index';

Sentry.init({
  debug: true,
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn:
    process.env.REACT_APP_E2E_TEST_DSN ||
    'https://3b6c388182fb435097f41d181be2b2ba@o4504321058471936.ingest.sentry.io/4504321066008576',
  release: 'e2e-test',
  tunnel: 'http://localhost:3031/', // proxy server
});

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement, {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
});

root.render(
  <div>
    <Index />
  </div>,
);
