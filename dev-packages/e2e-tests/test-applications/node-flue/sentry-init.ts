import { instrument } from '@flue/runtime';
import * as Sentry from '@sentry/node';

// Imported for its side effects as the first line of `src/app.ts`, which is how a Flue app is
// expected to set Sentry up: there is no framework-owned instrumentation hook to auto-discover.
Sentry.init({
  environment: 'qa',
  dsn: process.env.E2E_TEST_DSN,
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1.0,
  // Not a default integration. It only produces spans in the "orchestrion" test variant, where the
  // server starts with `NODE_OPTIONS=--import=@sentry/node/import` so the module transform is
  // registered before `dataloader` is loaded.
  integrations: [Sentry.dataloaderIntegration()],
});

instrument(Sentry.createFlueInstrumentation());
