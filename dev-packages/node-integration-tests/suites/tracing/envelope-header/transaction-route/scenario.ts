import { SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  traceLifecycle: 'static',
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
      [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
    },
  },
  () => {
    // noop
  },
);
