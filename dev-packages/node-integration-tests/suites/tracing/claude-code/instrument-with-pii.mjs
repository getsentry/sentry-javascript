import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

// Configuration with PII enabled
// This means input messages and output text SHOULD be recorded

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  sendDefaultPii: true,
  transport: loggingTransport,
  integrations: [Sentry.claudeCodeAgentSdkIntegration()],
});
