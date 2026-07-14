import * as Sentry from '@sentry/nestjs';

// Opt into diagnostics-channel injection BEFORE `Sentry.init()`. This swaps
// the OTel `Nest` instrumentation for the orchestrion (diagnostics-channel)
// one and synchronously installs the module hooks that inject the channels
Sentry.experimentalUseDiagnosticsChannelInjection();

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1,
  transportOptions: {
    // We expect the app to send a lot of events in a short time
    bufferSize: 1000,
  },
});
