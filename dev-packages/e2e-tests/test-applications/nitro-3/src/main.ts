import * as Sentry from '@sentry/browser';

declare const __E2E_TEST_TUNNEL__: boolean;

// Let's us test trace propagation
Sentry.init({
  environment: 'qa',
  dsn: __E2E_TEST_TUNNEL__ ? 'http://public@localhost:3031/1337' : 'https://public@dsn.ingest.sentry.io/1337',
  tunnel: __E2E_TEST_TUNNEL__ ? true : 'http://localhost:3031/', // proxy server
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1.0,
});
