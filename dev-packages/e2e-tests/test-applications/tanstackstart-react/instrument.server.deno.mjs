import { fetchIntegration } from '@sentry/deno';
import * as Sentry from '@sentry/tanstackstart-react';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
  // The `fetch` of Deno is not undici, so the Node SDK does not see outgoing requests.
  integrations: [fetchIntegration()],
});
