import * as Sentry from '@sentry/node';

// Preloaded via `node --import ./instrument.mjs` (through `mastra start --custom-args`,
// see package.json). This is the standard @sentry/node pattern for a bundled
// server: `Sentry.init` must run before the app (and `@mastra/core`) load, and it
// must NOT be bundled — Mastra's Rollup drops a side-effect-only import of an
// instrument module from the built entry, so an in-bundle `import './instrument'`
// never runs.
//
// This file is NOT bundled: it stays at the app root and is loaded from
// `node_modules` at runtime, the same @sentry/node copy the `@sentry/node/import`
// orchestrion loader uses — so the Mastra integration's constructor subscriber
// (set up here by `init`) and the constructor transform (set up by the loader)
// share one SDK instance and one diagnostics channel.
Sentry.init({
  environment: 'qa',
  dsn: process.env.E2E_TEST_DSN,
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1.0,
});
