import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: import.meta.env.PUBLIC_E2E_TEST_DSN,
  environment: import.meta.env.MODE || 'development',
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/',
});

// Workaround: propagate MFE identity from current scope to span attributes
const client = Sentry.getClient()!;
client.on('spanStart', span => {
  const mfeName = Sentry.getCurrentScope().getScopeData().tags['mfe.name'];
  if (typeof mfeName === 'string') {
    span.setAttribute('mfe.name', mfeName);
  }
});

// Load MFEs via Module Federation (React.lazy + dynamic import)
const MfeHeader = lazy(() => import('mfe_header/App'));
const MfeOne = lazy(() => import('mfe_one/App'));

function App() {
  return (
    <div id="app">
      <h1>Shell</h1>
      <Suspense fallback={<div>Loading header...</div>}>
        <MfeHeader />
      </Suspense>
      <Suspense fallback={<div>Loading mfe-one...</div>}>
        <MfeOne />
      </Suspense>
    </div>
  );
}

// Shell's own fetch — no MFE scope
fetch('http://localhost:6969/api/shell-config');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
