import * as Sentry from '@sentry/browser';

declare const __E2E_TEST_TUNNEL__: boolean;
declare const __E2E_TEST_BASE_PATH__: string;

// Let's us test trace propagation
Sentry.init({
  environment: 'qa',
  dsn: __E2E_TEST_TUNNEL__ ? 'http://public@localhost:3031/1337' : 'https://public@dsn.ingest.sentry.io/1337',
  // Plain Nitro has no client SDK to pass `baseURL` on, so the browser names it. The server picks it up itself.
  tunnel: __E2E_TEST_TUNNEL__
    ? __E2E_TEST_BASE_PATH__
      ? { basePath: __E2E_TEST_BASE_PATH__ }
      : true
    : 'http://localhost:3031/', // proxy server
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1.0,
});
