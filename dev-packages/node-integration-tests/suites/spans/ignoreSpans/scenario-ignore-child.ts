import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  traceLifecycle: 'stream',
  // This should match only the 'child-to-ignore' span
  ignoreSpans: ['child-to-ignore'],
  debug: true,
  clientReportFlushInterval: 1000,
});

// The segment span should be sent
Sentry.startSpan({ name: 'parent' }, parent => {
  console.log('xx parent span started', parent.spanContext().spanId);
  // This child span should be ignored
  Sentry.startSpan({ name: 'child-to-ignore' }, childToIgnore => {
    console.log('xx child-to-ignore span started', childToIgnore.spanContext().spanId);
    // but this one should be sent
    Sentry.startSpan({ name: 'child-of-ignored-child' }, childOfIgnoredChild => {
      console.log('xx child-of-ignored-child span started', childOfIgnoredChild.spanContext().spanId);
    });
  });
  // This child span should be sent
  Sentry.startSpan({ name: 'child-to-keep' }, childToKeep => {
    console.log('xx child-to-keep span started', childToKeep.spanContext().spanId);
  });
});

Sentry.flush(2000);
