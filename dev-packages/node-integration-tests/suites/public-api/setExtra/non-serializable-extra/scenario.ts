import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

type Circular = {
  self?: Circular;
};

const objCircular: Circular = {};
objCircular.self = objCircular;

Sentry.setExtra('non_serializable', objCircular);

Sentry.captureMessage('non_serializable');
