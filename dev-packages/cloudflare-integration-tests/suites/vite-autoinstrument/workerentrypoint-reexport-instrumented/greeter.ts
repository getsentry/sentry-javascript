import * as Sentry from '@sentry/cloudflare';
import { WorkerEntrypoint } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
}

class GreeterImpl extends WorkerEntrypoint<Env> {
  async fetch(): Promise<Response> {
    return new Response('Hello from the entrypoint');
  }
}

// Manually instrumented here, in a module separate from the worker entry, which
// only imports and re-exports the wrapped class.
export const GreeterEntrypoint = Sentry.withSentry(
  (env: Env) => ({ dsn: env.SENTRY_DSN, traceLifecycle: 'static', tracesSampleRate: 1.0 }),
  GreeterImpl,
);
