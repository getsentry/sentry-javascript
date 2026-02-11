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
Sentry.startSpan({ name: 'parent' }, _parent => {
  // This child span should be ignored
  Sentry.startSpan({ name: 'child-to-ignore' }, _childToIgnore => {
    // but this one should be sent
    Sentry.startSpan({ name: 'child-of-ignored-child' }, _childOfIgnoredChild => {});
  });
  // This child span should be sent
  Sentry.startSpan({ name: 'child-to-keep' }, _childToKeep => {});
});

Sentry.flush().catch(() => {});
