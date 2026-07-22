import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

// `graphqlIntegration()` is the diagnostics-channel implementation by default; configure it with
// `ignoreResolveSpans: false` so resolver spans are captured.
Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  integrations: [Sentry.graphqlIntegration({ ignoreResolveSpans: false })],
  transport: loggingTransport,
});
