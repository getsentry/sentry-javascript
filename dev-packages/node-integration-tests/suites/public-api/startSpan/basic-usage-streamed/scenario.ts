import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  traceLifecycle: 'stream',
  integrations: [Sentry.spanStreamingIntegration()],
  transport: loggingTransport,
  release: '1.0.0',
});

Sentry.startSpan({ name: 'test-span', op: 'test' }, segmentSpan => {
  Sentry.startSpan({ name: 'test-child-span', op: 'test-child' }, () => {
    // noop
  });

  const inactiveSpan = Sentry.startInactiveSpan({
    name: 'test-inactive-span',
    links: [{ context: segmentSpan.spanContext(), attributes: { 'sentry.link.type': 'some_relation' } }],
  });
  inactiveSpan.end();

  Sentry.startSpanManual({ name: 'test-manual-span' }, span => {
    span.end();
  });
});

void Sentry.flush();
