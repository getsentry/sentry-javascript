import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

// Disable the channel-based `expressIntegration()` so the deprecated `setupExpressErrorHandler`
// middleware is the sole error capturer (mechanism `auto.middleware.express`) — the fallback for
// setups where the channel-based auto capture is unavailable.
Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  integrations: integrations => integrations.filter(integration => integration.name !== 'Express'),
});
