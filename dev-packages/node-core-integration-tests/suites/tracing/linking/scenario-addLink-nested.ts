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

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Sentry.startSpan({ name: 'parent1' }, async parentSpan1 => {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  Sentry.startSpan({ name: 'child1.1' }, async childSpan1 => {
    childSpan1.addLink({
      context: parentSpan1.spanContext(),
      attributes: { 'sentry.link.type': 'previous_trace' },
    });

    childSpan1.end();
  });

  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  Sentry.startSpan({ name: 'child1.2' }, async childSpan2 => {
    childSpan2.addLink({
      context: parentSpan1.spanContext(),
      attributes: { 'sentry.link.type': 'previous_trace' },
    });

    childSpan2.end();
  });
});
