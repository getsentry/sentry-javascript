const Sentry = require('@sentry/node-core');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
});

throw new Error('foo', { cause: 'bar' });
