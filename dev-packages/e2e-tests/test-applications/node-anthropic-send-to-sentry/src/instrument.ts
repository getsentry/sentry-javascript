import * as Sentry from '@sentry/node';

// The setup from the docs, nothing more: preloaded with `node --import`, no tunnel, so the spans go to
// the real Sentry project behind `E2E_TEST_DSN`, where the tests read them back. The Anthropic integration
// is on by default; its runtime channel injection is what picks up the `@anthropic-ai/sdk` client in app.ts.
Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  environment: 'qa', // dynamic sampling bias to keep transactions
  tracesSampleRate: 1,
});
