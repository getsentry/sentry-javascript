import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

// Replay should not actually work, but still not error out
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
  integrations: [window.Replay],
});

// Ensure none of these break
window.Replay.start();
window.Replay.stop();
window.Replay.flush();
