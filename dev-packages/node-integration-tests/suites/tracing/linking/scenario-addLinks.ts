import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  integrations: [],
  transport: loggingTransport,
});

const span1 = Sentry.startInactiveSpan({ name: 'span1' });
span1.end();

const span2 = Sentry.startInactiveSpan({ name: 'span2' });
span2.end();

Sentry.startSpan({ name: 'rootSpan' }, rootSpan => {
  rootSpan.addLinks([
    { context: span1.spanContext() },
    {
      context: span2.spanContext(),
      attributes: { 'sentry.link.type': 'previous_trace' },
    },
  ]);
});
