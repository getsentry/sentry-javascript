import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0,
  integrations: [
    Sentry.replayIntegration({
      flushMinDelay: 200,
      flushMaxDelay: 200,
      minReplayDuration: 0,
    }),
    Sentry.feedbackIntegration(),
  ],
});
