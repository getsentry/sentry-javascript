import * as Sentry from '@sentry/node';

// eve auto-discovers `agent/instrumentation.ts` and runs it at server startup,
// before it loads the agent (and the `ai` SDK). That is early enough for the
// Sentry SDK to install its instrumentation, so no `--import` / `NODE_OPTIONS`
// bootstrap is needed. eve's own OpenTelemetry pipeline is intentionally left
// unused: the gen_ai spans come from Sentry's `ai` instrumentation, not OTel.
Sentry.init({
  environment: 'qa',
  dsn: process.env.E2E_TEST_DSN,
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1.0,
  // Not a default integration. It only produces spans in the "orchestrion" test
  // variant, where the server is started with
  // `NODE_OPTIONS=--import=@sentry/node/import` so the orchestrion module
  // transform is registered before `dataloader` loads.
  integrations: [Sentry.dataloaderIntegration()],
});
