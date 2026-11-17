import * as Sentry from '@sentry/cloudflare';
import { wrapFetchWithSentry } from '@sentry/tanstackstart-react';
import handler from '@tanstack/react-start/server-entry';

const app = wrapFetchWithSentry(handler);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.E2E_TEST_DSN,
    tunnel: 'http://localhost:3031/',
    tracesSampleRate: 1.0,
    environment: 'qa',
  }),
  {
    fetch(request, env, ctx) {
      // Lets a test check that the Worker's `ctx` survives the Sentry Vite plugin wrapping the server entry.
      if (new URL(request.url).pathname === '/test-execution-context') {
        return new Response(typeof ctx?.waitUntil);
      }

      return (app.fetch as ExportedHandlerFetchHandler<Env>)(request, env, ctx);
    },
  } satisfies ExportedHandler<Env>,
);
