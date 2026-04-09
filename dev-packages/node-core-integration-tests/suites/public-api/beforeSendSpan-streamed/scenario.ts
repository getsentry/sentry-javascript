import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { setupOtel } from '../../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  traceLifecycle: 'stream',
  transport: loggingTransport,
  release: '1.0.0',
  beforeSendSpan: Sentry.withStreamedSpan(span => {
    if (span.name === 'test-child-span') {
      span.name = 'customChildSpanName';
      if (!span.attributes) {
        span.attributes = {};
      }
      span.attributes['sentry.custom_attribute'] = 'customAttributeValue';
      // @ts-ignore - technically this is something we have to expect, despite types saying it's invalid
      span.status = 'something';
      span.links = [
        {
          trace_id: '123',
          span_id: '456',
          attributes: {
            'sentry.link.type': 'custom_link',
          },
        },
      ];
    }
    return span;
  }),
});

setupOtel(client);

Sentry.startSpan({ name: 'test-span', op: 'test' }, () => {
  Sentry.startSpan({ name: 'test-child-span', op: 'test-child' }, () => {
    // noop
  });
});

void Sentry.flush();
