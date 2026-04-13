import * as Sentry from '@sentry/tanstackstart-react';
import { createFileRoute } from '@tanstack/react-router';

const USE_TUNNEL_ROUTE = process.env.E2E_TEST_USE_TUNNEL_ROUTE === '1';

const DEFAULT_DSN = 'https://public@dsn.ingest.sentry.io/1337';
const TUNNEL_DSN = 'http://public@localhost:3031/1337';

export const Route = createFileRoute('/monitor')({
  server: Sentry.createSentryTunnelRoute({
    allowedDsns: [USE_TUNNEL_ROUTE ? TUNNEL_DSN : DEFAULT_DSN],
  }),
});
