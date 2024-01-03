import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
});

try {
  throw new Error('catched_error');
} catch (err) {
  Sentry.captureException(err);
}
