/**
 * By default, Remix will handle hydrating your app on the client for you.
 * You are free to delete this file if you'd like to, but if you ever want it revealed again, you can run `npx remix reveal` ✨
 * For more information, see https://remix.run/file-conventions/entry.client
 */

import { RemixBrowser, useLocation, useMatches } from '@remix-run/react';
import * as Sentry from '@sentry/remix';
import { StrictMode, startTransition, useEffect } from 'react';
import { hydrateRoot } from 'react-dom/client';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: window.ENV.SENTRY_DSN,
  integrations: [
    Sentry.browserTracingIntegration({
      useEffect,
      useLocation,
      useMatches,
    }),
  ],
  // Performance Monitoring
  tracesSampleRate: 1.0, // Capture 100% of the transactions, reduce in production!
});

Sentry.addEventProcessor(event => {
  if (
    event.type === 'transaction' &&
    (event.contexts?.trace?.op === 'pageload' || event.contexts?.trace?.op === 'navigation')
  ) {
    const eventId = event.event_id;
    if (eventId) {
      window.recordedTransactions = window.recordedTransactions || [];
      window.recordedTransactions.push(eventId);
    }
  }

  return event;
});

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <RemixBrowser />
    </StrictMode>,
  );
});
