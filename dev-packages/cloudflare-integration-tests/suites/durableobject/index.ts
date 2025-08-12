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
  async sayHello(name: string): Promise<string> {
    return `Hello, ${name}`;
  }
}

export const TestDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  TestDurableObjectBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
  }),
  {
    async fetch(request, env): Promise<Response> {
      const id: DurableObjectId = env.TEST_DURABLE_OBJECT.idFromName('test');
      const stub = env.TEST_DURABLE_OBJECT.get(id) as unknown as TestDurableObjectBase;
      const greeting = await stub.sayHello('world');

      return new Response(greeting);
    },
  },
);
