import * as Sentry from '@sentry/node';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
});

const eventId = Sentry.captureException(new Error('Sentry Debug ID E2E Test Error'));

process.stdout.write(eventId);
