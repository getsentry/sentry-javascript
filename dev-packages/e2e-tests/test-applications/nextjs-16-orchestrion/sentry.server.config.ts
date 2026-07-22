import * as Sentry from '@sentry/nextjs';

// Channel-based auto-instrumentation is the default: the SDK subscribes to the diagnostics-channel
// events (e.g. for `pg` and `ioredis`) injected at build time by the orchestrion transform (the
// Turbopack loader / webpack plugin, see `next.config.ts`) and turns them into Sentry spans.
Sentry.init({
  traceLifecycle: 'static',
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1.0,
  // `generic-pool` and `lru-memoizer` are default integrations, but `dataloader` and `knex` are
  // opt-in, so they must be added explicitly for their orchestrion channel subscribers to activate.
  integrations: [Sentry.dataloaderIntegration(), Sentry.knexIntegration()],
});
