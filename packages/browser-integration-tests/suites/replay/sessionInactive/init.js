import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;
window.Replay = new Sentry.Replay({
  flushMinDelay: 200,
  flushMaxDelay: 200,
});

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 0,
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 0.0,
  debug: true,

  integrations: [window.Replay],
});

window.Replay._replay.timeouts = {
  sessionIdlePause: 1000, // this is usually 5min, but we want to test this with shorter times
  sessionIdleExpire: 900000, // defayult: 15min
  maxSessionLife: 3600000, // default: 60min
};
