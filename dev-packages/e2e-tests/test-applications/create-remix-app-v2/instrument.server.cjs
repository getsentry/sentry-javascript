const Sentry = require('@sentry/remix');

const injectOrchestrion = process.env.INJECT_ORCHESTRION === 'true';

if (injectOrchestrion) {
  // Opt into diagnostics-channel-based auto-instrumentation. This registers the
  // channel subscribers (e.g. for mysql and ioredis) that turn the
  // diagnostics-channel events - injected at build time by the orchestrion Vite
  // plugin (see vite.config.ts) - into Sentry spans. Must run before Sentry.init().
  Sentry.experimentalUseDiagnosticsChannelInjection();
}

Sentry.init({
  tracesSampleRate: 1.0, // Capture 100% of the transactions, reduce in production!
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  tunnel: 'http://localhost:3031/', // proxy server
});
