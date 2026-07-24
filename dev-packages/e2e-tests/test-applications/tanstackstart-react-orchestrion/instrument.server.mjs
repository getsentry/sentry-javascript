import * as Sentry from '@sentry/tanstackstart-react';

// Opt into diagnostics-channel-based auto-instrumentation. This registers the
// channel subscribers (e.g. for `mysql` and `ioredis`) that turn the
// diagnostics-channel events — injected at build time by the orchestrion Vite
// plugin (see `vite.config.ts`) — into Sentry spans. Must run before
// `Sentry.init()`.
Sentry.experimentalUseDiagnosticsChannelInjection();

Sentry.init({
  traceLifecycle: 'static',
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1,
  transportOptions: {
    // We expect the app to send a lot of events in a short time
    bufferSize: 1000,
  },
});
