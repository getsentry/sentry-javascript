// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  environment: 'qa', // dynamic sampling bias to keep transactions

  // Add optional integrations for additional features
  integrations: [Sentry.replayIntegration()],
  tunnel: 'http://localhost:3031/', // proxy server

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,
  transportOptions: {
    // We expect the app to send a lot of events in a short time
    bufferSize: 1000,
  },
});
