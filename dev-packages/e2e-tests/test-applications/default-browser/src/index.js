import * as Sentry from '@sentry/react';

Sentry.init({
  release: 'e2e-test',
  dsn: process.env.E2E_TEST_DSN,
  tunnel: 'http://localhost:3031',
  integrations: [Sentry.browserTracingIntegration()],
});

document.getElementById('exception-button').addEventListener('click', () => {
  throw new Error('I am an error!');
});
