import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  TEST_DURABLE_OBJECT: DurableObjectNamespace<TestDurableObjectBase>;
}

class TestDurableObjectBase extends DurableObject<Env> {
  private overlappingCalls = 0;
  private releaseOverlappingCalls: () => void = () => {};
  private readonly allOverlappingCallsArrived = new Promise<void>(resolve => {
    this.releaseOverlappingCalls = resolve;
  });

  async failingRpcMethod(): Promise<void> {
    throw new Error('Test error from Durable Object RPC method');
  }

  // Each call waits until the other one has arrived, so both are in flight at the same time.
  async overlappingFailingRpcMethod(label: string): Promise<void> {
    this.overlappingCalls++;
    if (this.overlappingCalls === 2) {
      this.releaseOverlappingCalls();
    }

    await this.allOverlappingCallsArrived;
    throw new Error(`Overlapping RPC call ${label}`);
  }
}

export const TestDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    enableRpcTracePropagation: true,
    tracesSampleRate: 1.0,
  }),
  TestDurableObjectBase,
);

// The caller is not instrumented, so its RPC calls carry no trace metadata.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/overlapping') {
      const stub = env.TEST_DURABLE_OBJECT.get(env.TEST_DURABLE_OBJECT.idFromName('overlapping'));
      const results = await Promise.allSettled([
        stub.overlappingFailingRpcMethod('a'),
        stub.overlappingFailingRpcMethod('b'),
      ]);

      return new Response(results.map(result => result.status).join(','));
    }

    const stub = env.TEST_DURABLE_OBJECT.get(env.TEST_DURABLE_OBJECT.idFromName('test'));

    try {
      await stub.failingRpcMethod();
      return new Response('no error');
    } catch (error) {
      return new Response(String((error as Error).message));
    }
  },
} satisfies ExportedHandler<Env>;
