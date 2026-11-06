import * as Sentry from '@sentry/astro';

// By default, the Worker wrapper initializes Sentry from Wrangler bindings and this file only
// prevents Astro from injecting its default Node SDK initialization. The `server-config` variant
// has no `SENTRY_DSN` binding and initializes from here instead.
if (import.meta.env.PUBLIC_E2E_TEST_SERVER_CONFIG) {
  Sentry.init({
    dsn: import.meta.env.PUBLIC_E2E_TEST_DSN,
    environment: 'qa',
    tracesSampleRate: 1.0,
    tunnel: 'http://localhost:3031/', // proxy server
  });
}
