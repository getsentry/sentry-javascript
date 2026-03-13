import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { setupOtel } from '../../../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  traceLifecycle: 'stream',
  integrations: [Sentry.spanStreamingIntegration()],
  transport: loggingTransport,
});

setupOtel(client);

Sentry.startSpan({ name: 'test-span', op: 'test' }, () => {
  Sentry.startSpan({ name: 'test-child-span', op: 'test-child' }, () => {
    // noop
  });

  const inactiveSpan = Sentry.startInactiveSpan({ name: 'test-inactive-span' });
  inactiveSpan.end();

  Sentry.startSpanManual({ name: 'test-manual-span' }, span => {
    span.end();
  });
});

void Sentry.flush();
