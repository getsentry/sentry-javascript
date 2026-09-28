import { extend } from '@flue/runtime/cloudflare';
import * as Sentry from '@sentry/cloudflare';

// Each Flue agent runs in its own Durable Object, so the DO class is what has to be wrapped for
// `Sentry.init` to run and spans to be flushed. The agent module re-exports this as `cloudflare`,
// which is how Flue picks it up — defining it here alone does nothing.
//
// There is deliberately no `instrument()` call in this app: registering the Flue instrumentation is
// what `@sentry/cloudflare/vite` does at build time, and these tests exist to prove it.
export const cloudflare = extend({
  wrap: Final =>
    Sentry.instrumentDurableObjectWithSentry(
      (env: Env) => ({
        dsn: env.E2E_TEST_DSN,
        environment: 'qa',
        tunnel: 'http://localhost:3031/', // proxy server
        tracesSampleRate: 1.0,
      }),
      Final,
    ),
});
