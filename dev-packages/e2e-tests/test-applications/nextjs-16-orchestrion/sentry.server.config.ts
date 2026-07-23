import * as Sentry from '@sentry/nextjs';

// Opt into diagnostics-channel-based auto-instrumentation. This registers the
// channel subscribers (e.g. for `pg` and `ioredis`) that turn the
// diagnostics-channel events — injected at build time by the orchestrion transform
// (the Turbopack loader / webpack plugin, see `next.config.ts`) — into Sentry spans.
// Must run before `Sentry.init()`.
Sentry.experimentalUseDiagnosticsChannelInjection();

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1.0,
  // `generic-pool` and `lru-memoizer` are default integrations, but `dataloader` and `knex` are
  // opt-in, so they must be added explicitly for their orchestrion channel subscribers to activate.
  integrations: [Sentry.dataloaderIntegration(), Sentry.knexIntegration()],
});
