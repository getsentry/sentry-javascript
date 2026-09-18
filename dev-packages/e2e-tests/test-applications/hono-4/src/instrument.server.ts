// Cloudflare-SDK init
export default (env: { E2E_TEST_DSN: string }) => ({
  dsn: env.E2E_TEST_DSN,
  environment: 'qa',
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/',
});
