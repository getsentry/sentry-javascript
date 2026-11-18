import * as Sentry from '@sentry/aws-serverless';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  integrations: [
    Sentry.awsIntegration({
      recordInputs: ({ input }) => input.requestMetadata?.privacy === 'public',
      recordOutputs: () => Sentry.getCurrentScope().getScopeData().tags.privacy === 'public',
    }),
  ],
  transport: loggingTransport,
});
