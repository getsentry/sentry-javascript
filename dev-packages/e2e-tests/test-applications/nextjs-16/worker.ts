import * as Sentry from '@sentry/nextjs/cloudflare';
// @ts-ignore the file exists only after `opennextjs-cloudflare build`
import handler from './.open-next/worker.js';

// @ts-ignore the file exists only after `opennextjs-cloudflare build`
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from './.open-next/worker.js';

export default Sentry.withSentry(
  (env: { E2E_TEST_DSN: string }) => ({
    environment: 'qa', // dynamic sampling bias to keep transactions
    dsn: env.E2E_TEST_DSN,
    tunnel: `http://localhost:3031/`, // proxy server
    tracesSampleRate: 1.0,
    tracePropagationTargets: ['http://localhost:3030/propagation/test-outgoing-fetch/check'],
    integrations: [Sentry.vercelAIIntegration()],
  }),
  handler,
);
