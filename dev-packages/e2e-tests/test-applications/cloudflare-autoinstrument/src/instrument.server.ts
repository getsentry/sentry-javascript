// The auto-instrument plugin picks this file up by convention (it sits next to
// the worker entry named in wrangler's `main`) and imports its default export as
// the options callback for every wrapper it injects.
export default (env: Env) => ({
  traceLifecycle: 'static' as const,
  dsn: env.E2E_TEST_DSN,
  environment: 'qa',
  tunnel: 'http://localhost:3031/',
  tracesSampleRate: 1.0,
  transportOptions: {
    bufferSize: 1000,
  },
});
