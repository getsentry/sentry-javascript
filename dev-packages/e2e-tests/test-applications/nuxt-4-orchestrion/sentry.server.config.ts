import * as Sentry from '@sentry/nuxt';

// Opt into diagnostics-channel-based auto-instrumentation. This registers the
// channel subscribers (e.g. for `mysql`) that turn the diagnostics-channel
// events — injected at build time by the orchestrion Rollup plugin (see
// `nuxt.config.ts`) — into Sentry spans. Must run before `Sentry.init()`.
Sentry.experimentalUseDiagnosticsChannelInjection();

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/', // proxy server
});
