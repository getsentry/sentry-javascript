import { bunHttpServerIntegration } from '@sentry/bun';
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  traceLifecycle: 'static',
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1.0,
  tracePropagationTargets: ['http://localhost:3030/propagation/test-outgoing-fetch/check'],
  // Bun does not emit the `node:http` diagnostics channel the Node SDK uses to isolate incoming
  // requests, so each request would otherwise share one trace. Next.js emits its own server spans,
  // hence `spans: false` — this only isolates the request and resets its trace.
  integrations: [bunHttpServerIntegration({ spans: false })],
});
