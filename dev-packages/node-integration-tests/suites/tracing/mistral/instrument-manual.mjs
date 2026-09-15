import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  dataCollection: { genAI: { inputs: true, outputs: true } },
  transport: loggingTransport,
  // `instrumentMistralAiClient` is the manual path for runtimes without the orchestrion hook.
  // Drop the automatic integration so the scenario exercises it alone.
  integrations: integrations => integrations.filter(integration => integration.name !== 'Mistral'),
});
