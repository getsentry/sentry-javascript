import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  ...(process.env.PI_DURABLE_RECORDING === 'off'
    ? { dataCollection: { genAI: { inputs: false, outputs: false } } }
    : {}),
  ...(process.env.PI_DURABLE_RECORDING === 'integration-off'
    ? { integrations: [Sentry.piDurableIntegration({ recordInputs: false, recordOutputs: false })] }
    : {}),
});
