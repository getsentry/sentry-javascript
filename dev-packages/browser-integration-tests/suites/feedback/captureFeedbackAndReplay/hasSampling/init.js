import { Feedback } from '@sentry-internal/feedback';
import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0,
  integrations: [
    new Sentry.Replay({
      flushMinDelay: 200,
      flushMaxDelay: 200,
      minReplayDuration: 0,
    }),
    new Feedback(),
  ],
});
