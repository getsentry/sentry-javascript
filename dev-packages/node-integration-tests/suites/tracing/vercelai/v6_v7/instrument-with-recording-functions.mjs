import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

const isPublic = () => Sentry.getCurrentScope().getScopeData().tags.privacy === 'public';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  integrations: [
    Sentry.vercelAIIntegration({
      recordInputs: () => isPublic(),
      recordOutputs: ({ type }) => type !== 'generateText' && isPublic(),
    }),
  ],
  transport: loggingTransport,
});
