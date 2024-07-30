import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  tunnel: 'http://localhost:3031',
  integrations: [Sentry.browserTracingIntegration()],
});

setTimeout(() => {
  throw new Error('I am an error!');
}, 2000);
