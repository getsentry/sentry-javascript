// Add measure before SDK initializes
const end = performance.now();
performance.measure('Next.js-before-hydration', {
  duration: 1000,
  end,
});

import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  debug: true,
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      idleTimeout: 9000,
    }),
  ],
  tracesSampleRate: 1,
});
