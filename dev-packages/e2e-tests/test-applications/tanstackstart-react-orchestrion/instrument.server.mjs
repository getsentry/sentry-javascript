import * as Sentry from '@sentry/tanstackstart-react';

// Channel-based auto-instrumentation is the default: the SDK subscribes to the diagnostics-channel
// events (e.g. for `mysql` and `ioredis`) injected at build time by the orchestrion Vite plugin (see
// `vite.config.ts`) and turns them into Sentry spans.
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
