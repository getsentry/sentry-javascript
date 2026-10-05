import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  traceLifecycle: 'static',
  release: '1.0',
  tracesSampleRate: 1.0,
  integrations: [Sentry.graphqlIntegration({ useOperationNameForRootSpan: true, ignoreResolveSpans: false })],
  transport: loggingTransport,
});
