import * as Sentry from '@sentry/browser';
import { replayIntegration } from '@sentry-internal/replay';

window.Sentry = Sentry;
window.Replay = replayIntegration({
  flushMinDelay: 200,
  flushMaxDelay: 200,
  minReplayDuration: 0,
});

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 0,
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 0.0,

  integrations: [window.Replay],
});
