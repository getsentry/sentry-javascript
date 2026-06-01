import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  TEST_DURABLE_OBJECT: DurableObjectNamespace;
}

class AlarmDurableObjectBase extends DurableObject<Env> {
  public constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async setAlarm(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + 100);
  }

  async alarm(): Promise<void> {
    await new Promise<void>(resolve => setTimeout(resolve, 10));
  }
}

export const TestDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    enableRpcTracePropagation: true,
  }),
  AlarmDurableObjectBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);

      if (url.pathname === '/set-alarm') {
        const id = url.searchParams.get('id') || 'default';
        const doId = env.TEST_DURABLE_OBJECT.idFromName(id);
        const stub = env.TEST_DURABLE_OBJECT.get(doId) as unknown as AlarmDurableObjectBase;
        await stub.setAlarm();
        return new Response('Alarm scheduled');
      }

      return new Response('OK');
    },
  } satisfies ExportedHandler<Env>,
);
