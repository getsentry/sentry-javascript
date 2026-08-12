import * as Sentry from '@sentry/cloudflare';
import { createRequestHandler } from 'react-router';

const requestHandler = createRequestHandler(() => import('virtual:react-router/server-build'), import.meta.env.MODE);

interface Env {
  E2E_TEST_DSN: string;
}

// `withSentry` is what reads the build-time orchestrion marker; without it the injected
// `diagnostics_channel` publishers would fire with nobody subscribed.
export default Sentry.withSentry(
  (env: Env) => ({
    traceLifecycle: 'static',
    dsn: env.E2E_TEST_DSN,
    tunnel: 'http://localhost:3031/',
    tracesSampleRate: 1.0,
    environment: 'qa', // dynamic sampling bias to keep transactions
  }),
  {
    // No load context: React Router 8 takes a `RouterContextProvider`, not v7's `{ cloudflare }`
    // object, and nothing here reads bindings from a loader.
    async fetch(request) {
      return requestHandler(request);
    },
  } satisfies ExportedHandler<Env>,
);
