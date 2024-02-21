import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
});

Sentry.setContext('foo', { bar: 'baz' });
Sentry.captureMessage('simple_context_object');
