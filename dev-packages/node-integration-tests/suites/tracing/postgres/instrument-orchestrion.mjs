// Opting in via `experimentalUseDiagnosticsChannelInjection()` before `init()`
// is all that's needed. Because this file is loaded
// (via `--import`/`--require`) before the scenario imports `pg`,
// `Sentry.init()` synchronously installs the channel-injection hooks, so the
// OTel `Postgres` instrumentation is swapped for the diagnostics-channel one.
import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.experimentalUseDiagnosticsChannelInjection();

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});
