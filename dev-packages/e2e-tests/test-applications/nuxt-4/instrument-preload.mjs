// Simulates a v10-style `node --import` preload that fully initializes the SDK
// before the config bundled into the server build runs its own `Sentry.init`.
import { bunHttpServerIntegration } from '@sentry/bun';
import * as Sentry from '@sentry/nuxt';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/',
  // The SDK skips the second init with the integrations of `sentry.server.config.ts`, so the preload adds the one Bun
  // needs for `http.server` spans.
  integrations: process.versions.bun ? [bunHttpServerIntegration()] : [],
});
