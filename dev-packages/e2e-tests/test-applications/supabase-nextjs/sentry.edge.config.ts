// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  environment: 'qa', // dynamic sampling bias to keep transactions
  sendDefaultPii: true,
  tracesSampleRate: 1,
  tunnel: 'http://localhost:3031/', // proxy server
  transportOptions: {
    // We expect the app to send a lot of events in a short time
    bufferSize: 1000,
  },
});
