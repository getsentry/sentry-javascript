import * as Sentry from '@sentry/cloudflare';
import handler from '@tanstack/react-start/server-entry';

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.E2E_TEST_DSN,
    tunnel: 'http://localhost:3031/',
    tracesSampleRate: 1.0,
    environment: 'qa',
  }),
  // @ts-expect-error - handler is not typed as a Cloudflare handler
  handler,
);
