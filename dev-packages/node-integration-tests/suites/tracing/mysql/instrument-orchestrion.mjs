// Opting in via `experimentalUseDiagnosticsChannelInjection()` (before `init`)
// is all that's needed.
//
// `Sentry.init()` swaps the OTel `mysql` instrumentation
// for the diagnostics-channel one and synchronously
// installs the module hooks that inject the channels.
import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.experimentalUseDiagnosticsChannelInjection();

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});
