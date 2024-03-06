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
  replaysSessionSampleRate: 0.0,
  replaysOnErrorSampleRate: 1.0,

  integrations: [window.Replay],
});
