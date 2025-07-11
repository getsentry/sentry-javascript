import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-core-integration-tests';
import { setupOtel } from '../../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  tracesSampleRate: 1,
  environment: 'production',
});

setupOtel(client);

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Sentry.startSpan(
  { name: 'initial-name', attributes: { [Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url' } },
  async span => {
    Sentry.captureMessage('message-1');

    span.updateName('updated-name-1');
    span.setAttribute(Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');

    Sentry.captureMessage('message-2');

    span.updateName('updated-name-2');
    span.setAttribute(Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'custom');

    Sentry.captureMessage('message-3');

    span.end();
  },
);
