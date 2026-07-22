import * as Sentry from '@sentry/nuxt';

// The Nuxt module transforms supported Nitro dependencies when enabled in `nuxt.config.ts`.
// Channel-based auto-instrumentation is the default, so the SDK subscribes to those channel events
// and turns them into spans.
Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/', // proxy server
});
