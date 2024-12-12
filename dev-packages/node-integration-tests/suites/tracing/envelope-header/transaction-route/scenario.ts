import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracePropagationTargets: [/\/v0/, 'v1'],
  tracesSampleRate: 1,
  integrations: [],
  transport: loggingTransport,
});

Sentry.startSpan(
  {
    name: 'GET /route',
    attributes: {
      'http.method': 'GET',
      'http.route': '/route',
      [Sentry.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
      [Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
    },
  },
  () => {
    // noop
  },
);
