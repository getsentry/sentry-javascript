import * as Sentry from '@sentry/nextjs';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1.0,
  transportOptions: {
    // We are doing a lot of events at once in this test
    bufferSize: 1000,
  },
  // Lets the middleware tunnel envelopes for the event proxy's DSN.
  integrations: [
    Sentry.serveTunnelIntegration({ allowedDsns: ['http://public@localhost:3031/1337'], basePath: '/my-app' }),
  ],
});
