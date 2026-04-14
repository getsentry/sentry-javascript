import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  TEST_DURABLE_OBJECT: DurableObjectNamespace;
}

class TestDurableObjectBase extends DurableObject<Env> {
  public constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async alarm(): Promise<void> {
    const action = await this.ctx.storage.get<string>('alarm-action');
    if (action === 'throw') {
      throw new Error('Alarm error captured by Sentry');
    }
  }

  async setAlarm(action: string): Promise<void> {
    await this.ctx.storage.put('alarm-action', action);
    await this.ctx.storage.setAlarm(Date.now() + 500);
  }
}

export const TestDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    instrumentPrototypeMethods: true,
  }),
  TestDurableObjectBase,
);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const id: DurableObjectId = env.TEST_DURABLE_OBJECT.idFromName('test');
    const stub = env.TEST_DURABLE_OBJECT.get(id) as unknown as TestDurableObjectBase;

    if (url.pathname === '/setAlarm') {
      const action = url.searchParams.get('action') || 'succeed';
      await stub.setAlarm(action);
      return new Response('Alarm set');
    }

    return new Response('OK');
  },
};
