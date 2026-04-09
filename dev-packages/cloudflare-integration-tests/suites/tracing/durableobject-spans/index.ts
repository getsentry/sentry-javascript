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

  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  async doWork(): Promise<string> {
    const results: string[] = [];

    for (let i = 1; i <= 5; i++) {
      await Sentry.startSpan({ name: `task-${i}`, op: 'task' }, async () => {
        // Simulate async work
        await new Promise<void>(resolve => setTimeout(resolve, 1));
        results.push(`done-${i}`);
      });
    }

    return results.join(',');
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
  async fetch(_request: Request, env: Env): Promise<Response> {
    const id: DurableObjectId = env.TEST_DURABLE_OBJECT.idFromName('test');
    const stub = env.TEST_DURABLE_OBJECT.get(id) as unknown as TestDurableObjectBase;
    const result = await stub.doWork();
    return new Response(result);
  },
};
