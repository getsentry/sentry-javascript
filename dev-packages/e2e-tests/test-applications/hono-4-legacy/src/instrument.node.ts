import * as Sentry from '@sentry/hono/node';

Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  environment: 'qa',
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/',
  // Several tests trigger the same server error one after another, which Dedupe would drop.
  integrations: integrations => integrations.filter(integration => integration.name !== 'Dedupe'),
});
