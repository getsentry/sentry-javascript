import * as Sentry from '@sentry/cloudflare';
import handler from '@astrojs/cloudflare/entrypoints/server';

export default Sentry.withSentry(
  env => ({
    dsn: env.E2E_TEST_DSN,
    environment: 'qa',
    tracesSampleRate: 1.0,
    tunnel: 'http://localhost:3031/', // proxy server
    debug: true,
  }),
  handler,
);
