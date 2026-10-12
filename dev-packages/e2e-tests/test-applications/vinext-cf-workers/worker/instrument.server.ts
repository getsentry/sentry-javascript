// The Vite plugin uses the default export of this file, next to the Worker entry, as the options callback.
export default (env: { E2E_TEST_DSN: string }) => ({
  dsn: env.E2E_TEST_DSN,
  environment: 'qa',
  tunnel: 'http://localhost:3031/',
  tracesSampleRate: 1.0,
});
