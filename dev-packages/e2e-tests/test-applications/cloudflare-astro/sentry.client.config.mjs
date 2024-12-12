import * as Sentry from '@sentry/astro';

Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
});
