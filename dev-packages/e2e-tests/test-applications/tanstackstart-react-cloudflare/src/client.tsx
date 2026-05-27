import * as Sentry from '@sentry/browser';
import { StartClient } from '@tanstack/react-start/client';
import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';

Sentry.init({
  environment: 'qa',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  release: 'e2e-test',
  tunnel: 'http://localhost:3031/',
});

console.log('early-breadcrumb-from-client-entry');

if (window.location.pathname === '/crash-before-hydration') {
  throw new Error('Client Entry Crash');
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});
