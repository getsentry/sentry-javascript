import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  release: '1.0.0',
  traceLifecycle: 'static',
  beforeSendSpan: Sentry.withStaticSpan(span => {
    if (span.description === 'test-child-span') {
      span.description = 'customChildSpanName';
      span.data['sentry.custom_attribute'] = 'customAttributeValue';
    }

    if (span.is_segment) {
      span.description = 'customRootSpanName';
      span.data['sentry.custom_root_attribute'] = 'customRootAttributeValue';
    }

    return span;
  }),
});

Sentry.startSpan({ name: 'test-span', op: 'test' }, () => {
  Sentry.startSpan({ name: 'test-child-span', op: 'test-child' }, () => {
    // noop
  });
});

void Sentry.flush();
