import * as Sentry from '@sentry/astro';

// The Worker wrapper already initializes a request-scoped Cloudflare client from the Wrangler bindings.
if (!Sentry.getClient()) {
  Sentry.init({
    dsn: import.meta.env.PUBLIC_E2E_TEST_DSN,
    environment: 'qa',
    tracesSampleRate: 1.0,
    tunnel: 'http://localhost:3031/', // proxy server
  });
}
