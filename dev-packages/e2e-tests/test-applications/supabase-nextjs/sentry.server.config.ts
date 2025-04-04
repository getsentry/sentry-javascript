// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  environment: 'qa', // dynamic sampling bias to keep transactions
  tracesSampleRate: 1,
  sendDefaultPii: true,
  tunnel: 'http://localhost:3031/', // proxy server
  transportOptions: {
    // We expect the app to send a lot of events in a short time
    bufferSize: 1000,
  },
});
