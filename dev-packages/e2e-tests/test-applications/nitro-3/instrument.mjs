import * as Sentry from '@sentry/nitro';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
  // With the import hook preloaded, leave channel injection to the hook, so the tests show that the hook sets it up.
  enableRuntimeChannelInjection: !process.env.E2E_IMPORT_HOOK,
});
