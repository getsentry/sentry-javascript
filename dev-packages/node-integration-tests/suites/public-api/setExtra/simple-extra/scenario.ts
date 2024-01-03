import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
});

Sentry.setExtra('foo', {
  foo: 'bar',
  baz: {
    qux: 'quux',
  },
});
Sentry.captureMessage('simple_extra');
