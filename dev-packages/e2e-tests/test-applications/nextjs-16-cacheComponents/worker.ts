import * as Sentry from '@sentry/nextjs/cloudflare';
// @ts-ignore the file exists only after `opennextjs-cloudflare build`
import handler from './.open-next/worker.js';

// @ts-ignore the file exists only after `opennextjs-cloudflare build`
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from './.open-next/worker.js';

export default Sentry.withSentry(
  (env: { E2E_TEST_DSN: string }) => ({
    // The specs of this app assert transaction envelopes, like `sentry.server.config.ts`. On Workers the request
    // transaction belongs to this client, so with span streaming here they would never see one.
    traceLifecycle: 'static',
    environment: 'qa', // dynamic sampling bias to keep transactions
    dsn: env.E2E_TEST_DSN,
    tunnel: `http://localhost:3031/`, // proxy server
    tracesSampleRate: 1.0,
  }),
  handler,
);
