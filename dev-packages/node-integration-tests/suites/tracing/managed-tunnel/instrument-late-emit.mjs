import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  // The test's fake ingest, so the tunnel forwards the browser's envelopes to it.
  dsn: `http://public@localhost:${process.env.INGEST_PORT}/1337`,
  release: '1.0',
  integrations: [Sentry.serveTunnelIntegration()],
  transport: loggingTransport,
});
