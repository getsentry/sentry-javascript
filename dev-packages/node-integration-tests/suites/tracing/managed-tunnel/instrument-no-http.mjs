import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  // The test's fake ingest, so the tunnel forwards the browser's envelopes to it.
  dsn: `http://public@localhost:${process.env.INGEST_PORT}/1337`,
  release: '1.0',
  // Without the HTTP integration, whose `emit` wrapper would answer tunnel requests otherwise.
  integrations: integrations => [
    ...integrations.filter(integration => integration.name !== 'Http'),
    Sentry.serveTunnelIntegration(),
  ],
  transport: loggingTransport,
});
