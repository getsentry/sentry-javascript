import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
});

type Circular = {
  self?: Circular;
};

const objCircular: Circular = {};
objCircular.self = objCircular;

Sentry.setContext('non_serializable', objCircular);

Sentry.captureMessage('non_serializable');
