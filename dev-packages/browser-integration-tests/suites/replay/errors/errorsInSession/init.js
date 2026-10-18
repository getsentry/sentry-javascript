import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;
window.Replay = Sentry.replayIntegration({
  flushMinDelay: 200,
  flushMaxDelay: 200,
  minReplayDuration: 0,
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
});
