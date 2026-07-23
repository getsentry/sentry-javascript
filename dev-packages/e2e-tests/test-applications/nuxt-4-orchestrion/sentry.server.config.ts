import * as Sentry from '@sentry/nuxt';

// The Nuxt module transforms supported Nitro dependencies when enabled in
// `nuxt.config.ts`. In v10, register Node's matching channel subscribers before
// initializing the SDK so those events become spans.
Sentry.experimentalUseDiagnosticsChannelInjection();

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/', // proxy server
});
