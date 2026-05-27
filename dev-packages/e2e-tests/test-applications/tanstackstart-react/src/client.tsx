import * as Sentry from '@sentry/tanstackstart-react';
import { StartClient } from '@tanstack/react-start/client';
import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: __APP_DSN__,
  // We recommend adjusting this value in production, or using tracesSampler
  // for finer control
  tracesSampleRate: 1.0,
  release: 'e2e-test',
  tunnel: __APP_TUNNEL__,
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
