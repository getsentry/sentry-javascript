import { defineCloudflareOptions, serveTunnelIntegration } from '@sentry/cloudflare';

export default defineCloudflareOptions(env => ({
  dsn: env.E2E_TEST_DSN,
  environment: 'qa',
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/', // proxy server
  integrations: import.meta.env.PUBLIC_E2E_TEST_TUNNEL ? [serveTunnelIntegration()] : [],
  debug: true,
}));
