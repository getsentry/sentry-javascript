import * as Sentry from '@sentry/solid/solid2';
import { solidRouterBrowserTracingIntegration } from '@sentry/solid/solid2/solidrouter';

Sentry.init({
  dsn: import.meta.env.PUBLIC_E2E_TEST_DSN,
  environment: 'qa', // dynamic sampling bias to keep transactions
  integrations: [solidRouterBrowserTracingIntegration()],
  release: 'e2e-test',
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1.0,
});
