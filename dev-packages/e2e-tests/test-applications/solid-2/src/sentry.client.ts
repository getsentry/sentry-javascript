// The explicit client entry: this module is reachable from the server graph
// (App.tsx imports it behind an `isServer` guard), where the bare package
// would resolve to the server half and the client integrations would not
// exist.
import * as Sentry from '@sentry/solid-2/client';

// Module-level so it runs when the app module is evaluated, before hydration.
Sentry.init({
  // We can't use env variables here, seems like they are stripped
  // out in production builds.
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  environment: 'qa', // dynamic sampling bias to keep transactions
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1.0,
  integrations: [Sentry.browserTracingIntegration(), Sentry.solidTracingIntegration()],
  debug: !!import.meta.env.DEBUG,
});
