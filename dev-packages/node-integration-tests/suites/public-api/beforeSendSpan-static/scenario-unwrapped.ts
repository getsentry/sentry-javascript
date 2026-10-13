import type { SpanJSON } from '@sentry/core';
import type { NodeOptions } from '@sentry/node';
import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

// Simulates a callback that was not migrated to `withStaticSpan`. The cast stands in for the
// JavaScript users who don't get a type error here.
const unmigratedBeforeSendSpan = ((span: SpanJSON) => {
  span.description = 'thisShouldNotBeApplied';
  return span;
}) as unknown as NodeOptions['beforeSendSpan'];

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  release: '1.0.0',
  traceLifecycle: 'static',
  beforeSendSpan: unmigratedBeforeSendSpan,
});

Sentry.startSpan({ name: 'test-span', op: 'test' }, () => {
  Sentry.startSpan({ name: 'test-child-span', op: 'test-child' }, () => {
    // noop
  });
});

void Sentry.flush();
