import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  tracePropagationTargets: ['http://example.com'],
  debug: process.env.SDK_DEBUG,
});
