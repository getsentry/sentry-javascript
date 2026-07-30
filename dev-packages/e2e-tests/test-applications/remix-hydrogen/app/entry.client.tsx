import { RemixBrowser, useLocation, useMatches } from '@remix-run/react';
import * as Sentry from '@sentry/remix/cloudflare';
import { StrictMode, startTransition } from 'react';
import { useEffect } from 'react';
import { hydrateRoot } from 'react-dom/client';

Sentry.init({
  traceLifecycle: 'static',
  environment: 'qa', // dynamic sampling bias to keep transactions
  // Could not find a working way to set the DSN in the browser side from the environment variables
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      useEffect,
      useLocation,
      useMatches,
    }),
  ],

  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/', // proxy server
});

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <RemixBrowser />
    </StrictMode>,
  );
});
