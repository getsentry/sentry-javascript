import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;
window.chrome = { runtime: { id: 'mock-extension-id' } };

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
});
