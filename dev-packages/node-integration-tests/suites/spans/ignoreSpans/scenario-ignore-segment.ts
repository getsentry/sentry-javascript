import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  traceLifecycle: 'stream',
  // This should match the segment span name 'segment-to-ignore'
  ignoreSpans: ['segment-to-ignore'],
  clientReportFlushInterval: 1000,
  debug: true,
});

// This segment span should be ignored, along with all its children
Sentry.startSpan({ name: 'segment-to-ignore' }, () => {
  Sentry.startSpan({ name: 'child-of-ignored-segment' }, () => {
    Sentry.startSpan({ name: 'grandchild-of-ignored-segment' }, () => {
      // noop
    });
  });
});

// This segment span should NOT be ignored and should be sent
Sentry.startSpan({ name: 'segment-to-keep' }, () => {
  Sentry.startSpan({ name: 'child-of-kept-segment' }, () => {
    // noop
  });
});

Sentry.flush();
