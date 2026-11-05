import * as Sentry from '@sentry/bun';

Sentry.initWithoutDefaultIntegrations({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
});
