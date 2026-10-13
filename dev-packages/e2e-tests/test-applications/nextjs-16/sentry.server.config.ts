import { bunHttpServerIntegration, fetchIntegration as bunFetchIntegration } from '@sentry/bun';
import { fetchIntegration as denoFetchIntegration } from '@sentry/deno';
import * as Sentry from '@sentry/nextjs';
import { Log } from '@sentry/nextjs';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1.0,
  tracePropagationTargets: ['http://localhost:3030/propagation/test-outgoing-fetch/check'],
  // debug: true,
  integrations: [
    Sentry.vercelAIIntegration(),
    Sentry.nodeRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 }),
    // Bun does not emit the `node:http` diagnostics channel the Node SDK uses to isolate incoming requests, so each
    // request would otherwise share one trace. Next.js emits its own server spans, hence `spans: false`.
    ...(process.versions.bun ? [bunHttpServerIntegration({ spans: false }), bunFetchIntegration()] : []),
    // The `fetch` of Deno is not undici, so the Node SDK does not see outgoing requests.
    ...(process.versions.deno ? [denoFetchIntegration()] : []),
  ],
  // Verify Log type is available
  beforeSendLog(log: Log) {
    return log;
  },
});
