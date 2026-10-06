import * as Sentry from '@sentry/node';
import { defineInstrumentation } from 'eve/instrumentation';

export default defineInstrumentation(
  Sentry.eveInstrumentation({
    environment: 'qa',
    dsn: process.env.E2E_TEST_DSN,
    tunnel: 'http://localhost:3031/', // proxy server
    tracesSampleRate: 1.0,
  }),
);
