import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  traceLifecycle: 'stream',
  // todo(v11): bridge-regression counterpart to instrument-with-datacollection.mjs; remove when sendDefaultPii is dropped in v11
  sendDefaultPii: true,
});
