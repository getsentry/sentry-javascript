import * as Sentry from '@sentry/remix';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1,
  tracePropagationTargets: ['example.org'],
});
