import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  TEST_DURABLE_OBJECT: DurableObjectNamespace;
}

class SqlDurableObjectBase extends DurableObject<Env> {
  public constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/exec') {
      this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)');
      this.ctx.storage.sql.exec('INSERT INTO users (name) VALUES (?)', 'Alice');
      const cursor = this.ctx.storage.sql.exec('SELECT * FROM users');
      const rows = cursor.toArray();

      return Response.json({ rows });
    }

    return new Response('OK');
  }
}

export const TestDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  SqlDurableObjectBase,
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
