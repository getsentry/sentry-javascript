import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  TEST_DURABLE_OBJECT: DurableObjectNamespace;
}

class SyncKvDurableObjectBase extends DurableObject<Env> {
  public constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(): Promise<Response> {
    this.ctx.storage.kv.put('test-key', { value: 'hello' });
    const val = this.ctx.storage.kv.get('test-key');
    const entries = [...this.ctx.storage.kv.list()];
    const deleted = this.ctx.storage.kv.delete('test-key');

    return Response.json({ get: val, listSize: entries.length, deleted });
  }
}

export const TestDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  SyncKvDurableObjectBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);

      if (url.pathname === '/flush-marker') {
        Sentry.captureMessage('flush-marker');
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      }

      const id = env.TEST_DURABLE_OBJECT.idFromName('test');
      const stub = env.TEST_DURABLE_OBJECT.get(id);
      return stub.fetch(request);
    },
  } satisfies ExportedHandler<Env>,
);
