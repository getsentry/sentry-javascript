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

  async fetch(_request: Request): Promise<Response> {
    throw new Error('Test error from Durable Object fetch handler');
  }
}

export const TestDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    traceLifecycle: 'static',
    tracesSampleRate: 1.0,
  }),
  TestDurableObjectBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    traceLifecycle: 'static',
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(_request: Request, env: Env): Promise<Response> {
      const id: DurableObjectId = env.TEST_DURABLE_OBJECT.idFromName('test');
      const stub = env.TEST_DURABLE_OBJECT.get(id);

      return stub.fetch('http://durable-object/');
    },
  } satisfies ExportedHandler<Env>,
);
