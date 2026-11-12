import * as Sentry from '@sentry/nextjs/cloudflare';
// @ts-ignore the file exists only after `opennextjs-cloudflare build`
import handler from './.open-next/worker.js';

export default Sentry.withSentry(
  () => ({
    environment: 'qa', // dynamic sampling bias to keep transactions
    // Sends the server spans and the tunnel requests to the proxy server, so the tests see whether a tunnel request was
    // sampled.
    dsn: 'http://public@localhost:3031/1337',
    tracesSampleRate: 1.0,
  }),
  handler,
);
