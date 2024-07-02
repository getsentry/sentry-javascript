import { RemixBrowser, useLocation, useMatches } from '@remix-run/react';
import * as Sentry from '@sentry/remix';
import { StrictMode, startTransition } from 'react';
import { useEffect } from 'react';
import { hydrateRoot } from 'react-dom/client';

Sentry.init({
  dsn: window.ENV.SENTRY_DSN,
  integrations: [
    new Sentry.BrowserTracing({
      routingInstrumentation: Sentry.remixRouterInstrumentation(useEffect, useLocation, useMatches),
    }),
    // Replay is only available in the client
    new Sentry.Replay(),
    new Sentry.BrowserProfilingIntegration(),
  ],

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,

  // Set `tracePropagationTargets` to control for which URLs distributed tracing should be enabled
  tracePropagationTargets: ['localhost', /^https:\/\/yourserver\.io\/api/],

  // Capture Replay for 10% of all sessions,
  // plus for 100% of sessions with an error
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Capture all profiles
  profilesSampleRate: 1.0,
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
