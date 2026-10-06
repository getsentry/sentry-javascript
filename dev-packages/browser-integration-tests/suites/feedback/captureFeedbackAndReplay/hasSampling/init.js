import * as Sentry from '@sentry/browser';
// Import this separately so that generatePlugin can handle it for CDN scenarios
import { feedbackIntegration } from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration({
      flushMinDelay: 200,
      flushMaxDelay: 200,
      minReplayDuration: 0,
    }),
    feedbackIntegration(),
  ],
});
