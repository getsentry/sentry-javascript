import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1,
  integrations: [
    // Used for testing http tracing
    new Sentry.Integrations.Http({ tracing: true }),
  ],
});
