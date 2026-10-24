import { instrument } from '@flue/runtime';
import * as Sentry from '@sentry/node';

// No tunnel: the spans go to the Sentry project behind `E2E_TEST_DSN`, where the tests read them back.
Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  tracesSampleRate: 1.0,
});

instrument(Sentry.createFlueInstrumentation());
