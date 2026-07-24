import * as Sentry from '@sentry/nuxt';

// The Nuxt module transforms supported Nitro dependencies when enabled in `nuxt.config.ts`.
Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/', // proxy server
});
