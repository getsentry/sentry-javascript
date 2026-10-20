import { instrument } from '@flue/runtime';
import * as Sentry from '@sentry/node';

// The setup from the docs: no tunnel, so the spans go to the real Sentry project behind
// `E2E_TEST_DSN`, where the tests read them back. Imported as the first line of `src/app.ts`
// because a Flue app has no framework-owned instrumentation hook to auto-discover.
Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  tracesSampleRate: 1.0,
});

instrument(Sentry.createFlueInstrumentation());
