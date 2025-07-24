import { HydratedRouter } from 'react-router/dom';
import * as Sentry from '@sentry/react-router/cloudflare';
import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  // Could not find a working way to set the DSN in the browser side from the environment variables
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.reactRouterTracingIntegration()],
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/', // proxy server
});

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
