import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  TEST_DURABLE_OBJECT: DurableObjectNamespace<TestDurableObjectBase>;
}

class TestDurableObjectBase extends DurableObject<Env> {
  async failingRpcMethod(): Promise<void> {
    throw new Error('Test error from Durable Object RPC method');
  }
}

export const TestDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  TestDurableObjectBase,
);

// The caller is not instrumented, so its RPC calls carry no trace metadata.
export default {
  async fetch(_request: Request, env: Env): Promise<Response> {
    const stub = env.TEST_DURABLE_OBJECT.get(env.TEST_DURABLE_OBJECT.idFromName('test'));

    try {
      await stub.failingRpcMethod();
      return new Response('no error');
    } catch (error) {
      return new Response(String((error as Error).message));
    }
  },
} satisfies ExportedHandler<Env>;
