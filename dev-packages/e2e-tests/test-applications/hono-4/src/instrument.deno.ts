import * as Sentry from '@sentry/deno';

Sentry.init({
  dsn: Deno.env.get('E2E_TEST_DSN'),
  environment: 'qa',
  dataCollection: {},
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/',
});
