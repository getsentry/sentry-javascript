import * as Sentry from '@sentry/nestjs';

// Channel-based (orchestrion diagnostics-channel) instrumentation is the default: `Sentry.init()`
// synchronously installs the module hooks that inject the channels the `Nest` listener subscribes to.
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
