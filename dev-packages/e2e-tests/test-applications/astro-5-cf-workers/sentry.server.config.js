import * as Sentry from '@sentry/astro';

// By default, the Worker wrapper initializes Sentry from Wrangler bindings and this file only
// prevents Astro from injecting its default Node SDK initialization. The `server-config` variants
// initialize from here instead: `1` without any `SENTRY_*` binding, `no-dsn` with the DSN coming
// from the `SENTRY_DSN` binding.
const serverConfigVariant = import.meta.env.PUBLIC_E2E_TEST_SERVER_CONFIG;

if (serverConfigVariant) {
  Sentry.init({
    dsn: serverConfigVariant === 'no-dsn' ? undefined : import.meta.env.PUBLIC_E2E_TEST_DSN,
    environment: 'qa',
    tracesSampleRate: 1.0,
    tunnel: 'http://localhost:3031/', // proxy server
  });
}
