import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [
    Sentry.mastraIntegration({
      recordInputs: ({ span }) => span.type === 'agent_run',
      // Mastra sets `output` only when the span ends, so this records outputs only if decided at start.
      recordOutputs: ({ span }) => span.output === undefined,
    }),
  ],
});
