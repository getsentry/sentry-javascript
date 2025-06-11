import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-core-integration-tests';
import { setupOtel } from '../../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  integrations: [],
  transport: loggingTransport,
});

setupOtel(client);

const span1 = Sentry.startInactiveSpan({ name: 'span1' });
span1.end();

Sentry.startSpan({ name: 'rootSpan' }, rootSpan => {
  rootSpan.addLink({
    context: span1.spanContext(),
    attributes: { 'sentry.link.type': 'previous_trace' },
  });
});
