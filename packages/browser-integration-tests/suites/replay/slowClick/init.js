import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;
window.Replay = new Sentry.Replay({
  flushMinDelay: 500,
  flushMaxDelay: 500,
  _experiments: {
    slowClicks: {
      threshold: 300,
      scrollThreshold: 300,
      timeout: 2000,
      ignoreSelectors: ['.ignore-class', '[ignore-attribute]'],
    },
  },
});

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 0,
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 0.0,

  integrations: [window.Replay],
});
