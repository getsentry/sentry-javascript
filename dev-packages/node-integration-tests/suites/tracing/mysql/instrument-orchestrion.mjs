import '@sentry/node/orchestrion';
import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  _experimentalUseOrchestrion: true,
  debug: true,
});

Sentry._experimentalSetupOrchestrion(client);
