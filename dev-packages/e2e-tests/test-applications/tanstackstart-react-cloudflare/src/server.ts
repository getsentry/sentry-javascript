import * as Sentry from '@sentry/cloudflare';
import { wrapFetchWithSentry } from '@sentry/tanstackstart-react';
import handler from '@tanstack/react-start/server-entry';

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.E2E_TEST_DSN,
    tunnel: 'http://localhost:3031/',
    tracesSampleRate: 1.0,
    environment: 'qa',
  }),
  wrapFetchWithSentry(handler),
);
