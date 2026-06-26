// Loaded via `--import` BEFORE the scenario module, so the channel-injection
// hooks are installed before `@nestjs/*` is imported. Opting in via
// `experimentalUseDiagnosticsChannelInjection()` (before `init`) is all
// that's needed.

import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

// opt into the orchestrion implementation
Sentry.experimentalUseDiagnosticsChannelInjection();

// Because we opted in, `Sentry.init()` swaps the OTel `Nest` instrumentation
// for the diagnostics-channel one and synchronously installs the module hooks.
Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});
