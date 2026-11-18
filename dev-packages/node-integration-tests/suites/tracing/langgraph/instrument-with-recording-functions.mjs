import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  // Spans that ignored the graph's decision would record.
  dataCollection: { genAI: { inputs: true, outputs: true } },
  transport: loggingTransport,
  integrations: [
    Sentry.langGraphIntegration({
      recordInputs: ({ config }) => config?.configurable?.privacy === 'public',
      recordOutputs: () => Sentry.getCurrentScope().getScopeData().tags.privacy === 'public',
    }),
  ],
});
