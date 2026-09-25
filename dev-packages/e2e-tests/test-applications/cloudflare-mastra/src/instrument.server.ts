// The auto-instrument plugin (`sentryCloudflareVitePlugin`) picks this file up by
// convention — it sits next to the worker entry named in wrangler's `main` — and
// imports its default export as the options callback for the `withSentry` wrapper it
// injects into the entry at build time.
export default (env: Env) => ({
  dsn: env.E2E_TEST_DSN,
  environment: 'qa',
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1.0,
});
