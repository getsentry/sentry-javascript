import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

// We mock this here to simulate a Firefox/Safari browser extension
window.browser = { runtime: { id: 'mock-extension-id' } };

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
});
