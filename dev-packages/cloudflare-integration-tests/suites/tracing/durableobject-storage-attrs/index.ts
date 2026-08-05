import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  TEST_DURABLE_OBJECT: DurableObjectNamespace;
}

class StorageAttrsDurableObjectBase extends DurableObject<Env> {
  public constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  async storeAndLoad(): Promise<string> {
    await this.ctx.storage.put('rpc-key', 'value');
    const value = await this.ctx.storage.get('rpc-key');

    // A storage call nested in a user-created span must NOT be attributed to that span's name —
    // only SDK-created Durable Object method spans declare `code.function.name`.
    await Sentry.startSpan({ name: 'custom-step', op: 'task' }, async () => {
      await this.ctx.storage.get('nested-key');
    });

    return String(value);
  }
}

export const TestDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    traceLifecycle: 'static',
    tracesSampleRate: 1.0,
    instrumentPrototypeMethods: true,
  }),
  StorageAttrsDurableObjectBase,
);

export default {
  async fetch(_request: Request, env: Env): Promise<Response> {
    const id: DurableObjectId = env.TEST_DURABLE_OBJECT.idFromName('test');
    const stub = env.TEST_DURABLE_OBJECT.get(id) as unknown as StorageAttrsDurableObjectBase;
    const result = await stub.storeAndLoad();
    return new Response(result);
  },
};
