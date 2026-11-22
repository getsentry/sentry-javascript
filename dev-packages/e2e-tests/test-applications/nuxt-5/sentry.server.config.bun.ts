import { bunServerIntegration, fetchIntegration } from '@sentry/bun';
import * as Sentry from '@sentry/nuxt';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  tunnel: 'http://localhost:3031/', // proxy server
  // Several tests trigger the same server error one after another, which Dedupe would drop.
  integrations: integrations => [
    ...integrations.filter(integration => integration.name !== 'Dedupe'),
    // On Bun, Nitro 3 builds with its `bun` preset, which serves with `Bun.serve`. Bun emits none of the undici channels
    // the Node SDK listens to, so these add the incoming request and outgoing `fetch` instrumentation.
    bunServerIntegration(),
    fetchIntegration(),
  ],
});
