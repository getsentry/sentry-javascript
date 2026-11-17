import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  dataCollection: { genAI: { inputs: false, outputs: process.env.RECORD_OUTPUTS === 'true' } },
  transport: loggingTransport,
  // Registers Sentry as the global tracer provider, which is what 1.x traces itself through.
  enableOpenTelemetrySetup: process.env.OTEL_SETUP === 'true',
  integrations:
    process.env.WITHOUT_ANTHROPIC === 'true'
      ? integrations => integrations.filter(integration => integration.name !== 'Anthropic_AI')
      : undefined,
});
