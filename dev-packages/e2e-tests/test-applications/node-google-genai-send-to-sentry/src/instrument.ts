import * as Sentry from '@sentry/node';

// Preloaded with `node --import` and no tunnel, so the spans go to the real Sentry project behind
// `E2E_TEST_DSN`, where the tests read them back. The Google GenAI integration is on by default.
Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  environment: 'qa', // dynamic sampling bias to keep transactions
  tracesSampleRate: 1,
});
