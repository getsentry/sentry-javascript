import { bunServerIntegration, fetchIntegration } from '@sentry/bun';
import * as Sentry from '@sentry/tanstackstart-react';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
  // Nitro's `bun` preset serves with `Bun.serve`, and Bun emits none of the undici channels the Node SDK listens to,
  // so these add the incoming request and outgoing `fetch` instrumentation.
  integrations: [bunServerIntegration(), fetchIntegration()],
});
