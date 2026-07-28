import * as Sentry from '@sentry/nextjs';

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
