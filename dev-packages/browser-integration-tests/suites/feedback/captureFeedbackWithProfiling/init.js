import * as Sentry from '@sentry/browser';
// Import these separately so that generatePlugin can handle them for CDN scenarios
// eslint-disable-next-line import/no-duplicates
import { browserProfilingIntegration } from '@sentry/browser';
// eslint-disable-next-line import/no-duplicates
import { feedbackIntegration } from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration(),
    browserProfilingIntegration(),
    feedbackIntegration({
      tags: { from: 'integration init' },
    }),
  ],
  tracesSampleRate: 1.0,
  profilesSampleRate: 1,
});
