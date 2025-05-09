import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  integrations: [],
  transport: loggingTransport,
});

const parentSpan1 = Sentry.startInactiveSpan({ name: 'parent1' });
parentSpan1.end();

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Sentry.startSpan(
  {
    name: 'parent2',
    links: [{ context: parentSpan1.spanContext(), attributes: { 'sentry.link.type': 'previous_trace' } }],
  },
  async () => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    Sentry.startSpan({ name: 'child2.1' }, async childSpan1 => {
      childSpan1.end();
    });
  },
);
