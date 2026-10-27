import * as Sentry from '@sentry/tanstackstart-react';
import { createFileRoute } from '@tanstack/react-router';

const USE_CUSTOM_TUNNEL_ROUTE = process.env.E2E_TEST_CUSTOM_TUNNEL_ROUTE === '1';

const DEFAULT_DSN = 'https://public@dsn.ingest.sentry.io/1337';
const TUNNEL_DSN = 'http://public@localhost:3031/1337';

// Example of a manually defined tunnel endpoint without relying on the
// managed route injected by `sentryTanstackStart({ tunnelRoute: ... })`.
// If you use a custom route like this one, set `tunnel: '/custom-monitor'` in the client SDK's
// `Sentry.init()` call so browser events are sent to the same endpoint.
export const Route = createFileRoute('/custom-monitor')({
  server: Sentry.createSentryTunnelRoute({
    allowedDsns: [USE_CUSTOM_TUNNEL_ROUTE ? TUNNEL_DSN : DEFAULT_DSN],
  }),
});
