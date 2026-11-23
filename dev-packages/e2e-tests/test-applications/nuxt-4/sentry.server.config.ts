import * as Sentry from '@sentry/nuxt';

Sentry.init({
  traceLifecycle: process.env.E2E_TEST_TRACE_LIFECYCLE === 'static' ? 'static' : undefined,
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  enableLogs: true,
  tunnel: 'http://localhost:3031/', // proxy server
  // Several tests trigger the same server error one after another, which Dedupe would drop.
  integrations: integrations => [...integrations.filter(integration => integration.name !== 'Dedupe')],
});
