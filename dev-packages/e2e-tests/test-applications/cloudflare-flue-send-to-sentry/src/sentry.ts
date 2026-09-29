import { extend } from '@flue/runtime/cloudflare';
import * as Sentry from '@sentry/cloudflare';

// Each Flue agent runs in its own Durable Object, so the DO class is what has to be wrapped for
// `Sentry.init` to run and spans to be flushed. The agent module re-exports this as `cloudflare`,
// which is how Flue picks it up.
export const cloudflare = extend({
  wrap: Final =>
    Sentry.instrumentDurableObjectWithSentry(
      (env: Env) => ({
        dsn: env.E2E_TEST_DSN,
        environment: 'qa', // dynamic sampling bias to keep transactions
        tracesSampleRate: 1.0,
      }),
      Final,
    ),
});
