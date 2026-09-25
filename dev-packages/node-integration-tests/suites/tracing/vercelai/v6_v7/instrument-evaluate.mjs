import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  // `NO_RECORDING` turns off recording of inputs and outputs for the privacy test.
  dataCollection: process.env.NO_RECORDING ? { genAI: { inputs: false, outputs: false } } : {},
  transport: loggingTransport,
});
