import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;
window.Replay = new Sentry.Replay({
  flushMinDelay: 500,
  flushMaxDelay: 500,
});

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1,
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 0.0,
  beforeSend(event, hint) {
    if (hint.originalException.message.includes('[drop]')) {
      return null;
    }
    return event;
  },
  integrations: [window.Replay],
  debug: true,
});
