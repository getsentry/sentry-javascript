import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

function captureError(): void {
  Sentry.captureException(new Error('duplicate error'));
}

function captureMessage(): void {
  Sentry.captureMessage('duplicate message');
}

// One call site for all captures, so that equal events also have equal stack traces.
for (const capture of [captureError, captureError, captureMessage, captureMessage, captureError]) {
  capture();
}
