import { SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  attachStacktrace: false,
});

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Sentry.startSpan({ name: 'initial-name', attributes: { [SENTRY_SEGMENT_NAME_SOURCE]: 'url' } }, async span => {
  Sentry.captureMessage('message-1');

  span.updateName('updated-name-1');
  span.setAttribute(SENTRY_SEGMENT_NAME_SOURCE, 'route');

  Sentry.captureMessage('message-2');

  span.updateName('updated-name-2');
  span.setAttribute(SENTRY_SEGMENT_NAME_SOURCE, 'custom');

  Sentry.captureMessage('message-3');

  span.end();
});
