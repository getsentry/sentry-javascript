import * as Sentry from '@sentry/astro';

Sentry.init({
  dsn: import.meta.env.PUBLIC_E2E_TEST_DSN,
  environment: 'qa',
  tracesSampleRate: 1.0,
  spotlight: true,
  tunnel: 'http://localhost:3031/', // proxy server
});
