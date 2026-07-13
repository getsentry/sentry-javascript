import { RemixBrowser, useLocation, useMatches } from '@remix-run/react';
import * as Sentry from '@sentry/remix';
import { StrictMode, startTransition, useEffect } from 'react';
import { hydrateRoot } from 'react-dom/client';

Sentry.init({
  dsn: 'https://username@domain/123',
  environment: 'qa', // dynamic sampling bias to keep transactions
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
