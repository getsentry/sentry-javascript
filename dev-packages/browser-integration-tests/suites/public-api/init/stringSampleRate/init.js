import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

window._errorCount = 0;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: '0',
  beforeSend() {
    window._errorCount++;
    return null;
  },
});
