import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;
window.Replay = Sentry.replayIntegration({
  flushMinDelay: 200,
  flushMaxDelay: 200,
  minReplayDuration: 0,
  useCompression: false,
});

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration(), window.Replay],
  tracePropagationTargets: [/.*/],
  environment: 'production',
  tracesSampleRate: 1,
  // Needs manual start!
  replaysSessionSampleRate: 0.0,
  replaysOnErrorSampleRate: 0.0,
});
