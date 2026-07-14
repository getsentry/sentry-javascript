const Sentry = require('@sentry/remix');

// Opt into diagnostics-channel-based auto-instrumentation. This registers the
// channel subscribers (e.g. for mysql and ioredis) that turn the
// diagnostics-channel events - injected at build time by the orchestrion Vite
// plugin (see vite.config.ts) - into Sentry spans. Must run before Sentry.init().
Sentry.experimentalUseDiagnosticsChannelInjection();

Sentry.init({
  dsn: 'https://username@domain/123',
  environment: 'qa', // dynamic sampling bias to keep transactions
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/', // proxy server
});
