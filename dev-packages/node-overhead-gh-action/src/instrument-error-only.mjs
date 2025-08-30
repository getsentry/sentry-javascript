import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.E2E_TEST_DSN || 'https://1234567890@sentry.io/1234567890',
});
