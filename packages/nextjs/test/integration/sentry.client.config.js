import * as Sentry from '@sentry/nextjs';
import { Integrations } from '@sentry/tracing';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampler: () => true,
  debug: process.env.SDK_DEBUG,

  integrations: [
    new Integrations.BrowserTracing({
      // Used for testing http tracing
      tracingOrigins: ['http://example.com'],
    }),
  ],
});
