import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

// Default configuration: sendDefaultPii: false
// This means NO input messages or output text should be recorded by default

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  sendDefaultPii: false,
  transport: loggingTransport,
  integrations: [Sentry.claudeCodeAgentSdkIntegration()],
});
