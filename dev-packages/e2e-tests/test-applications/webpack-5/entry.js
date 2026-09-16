import { browserTracingIntegration, init } from '@sentry/browser';

init({
  dsn: process.env.E2E_TEST_DSN,
  integrations: [browserTracingIntegration()],
  tunnel: 'http://localhost:3031',
});

setTimeout(() => {
  throw new Error('I am an error!');
}, 2000);
