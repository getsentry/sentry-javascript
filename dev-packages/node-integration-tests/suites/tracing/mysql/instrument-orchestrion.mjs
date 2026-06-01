// The orchestrion runtime hook is loaded via the `--import @sentry/node/orchestrion`
// CLI flag (see test.ts), mirroring real usage. That single ESM hook instruments
// both ESM and CJS user code, so the same flag works for the esm and cjs scenarios.
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
