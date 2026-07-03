import * as Sentry from '@sentry/tanstackstart-react';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
  traceLifecycle: process.env.E2E_TEST_STREAMED_SPANS === '1' ? 'stream' : 'static',
  transportOptions: {
    // We expect the app to send a lot of events in a short time
    bufferSize: 1000,
  },
});
