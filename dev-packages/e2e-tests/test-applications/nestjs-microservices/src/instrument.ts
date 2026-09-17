import * as Sentry from '@sentry/nestjs';

Sentry.init({
  environment: 'qa',
  dsn: process.env.E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`,
  tracesSampleRate: 1,
  transportOptions: {
    bufferSize: 1000,
  },
});
