import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  COUNTER: DurableObjectNamespace;
}

class CounterImpl extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    const current = ((await this.ctx.storage.get<number>('count')) ?? 0) + 1;
    await this.ctx.storage.put('count', current);
    return Response.json({ count: current });
  }
}

// The Durable Object is manually instrumented here, in a module *separate* from
// the worker entry. The entry only imports and re-exports the wrapped class.
export const Counter = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({ dsn: env.SENTRY_DSN, tracesSampleRate: 1.0 }),
  CounterImpl,
);
