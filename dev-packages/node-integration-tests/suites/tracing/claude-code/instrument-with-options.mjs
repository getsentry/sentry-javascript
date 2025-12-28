import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

// Configuration with custom options that override sendDefaultPii
// sendDefaultPii: false, but recordInputs: true, recordOutputs: false
// This means input messages SHOULD be recorded, but NOT output text

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  sendDefaultPii: false,
  transport: loggingTransport,
  integrations: [
    Sentry.claudeCodeAgentSdkIntegration({
      recordInputs: true,
      recordOutputs: false,
    }),
  ],
});
