// Add measure before SDK initializes
import * as Sentry from '@sentry/browser';

const end = performance.now();
performance.measure('Next.js-before-hydration', {
  duration: 1000,
  end,
});

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      idleTimeout: 9000,
    }),
  ],
  tracesSampleRate: 1,
});
