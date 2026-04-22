import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  TEST_DURABLE_OBJECT: DurableObjectNamespace;
}

// Regression test for https://github.com/getsentry/sentry-javascript/issues/17127
// This class mimics a real-world DO with private fields/methods and multiple public methods
class TestDurableObjectBase extends DurableObject<Env> {
  // Real private field for internal state (not accessed by RPC methods due to proxy limitations)
  #requestCount = 0;

  public constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  // Real private method for internal use
  #incrementCount(): void {
    this.#requestCount++;
  }

  // Internal method that uses private fields (called from non-RPC context like alarm/fetch)
  getRequestCount(): number {
    return this.#requestCount;
  }

  // The method being called in tests via RPC
  async sayHello(name: string): Promise<string> {
    return `Hello, ${name}`;
  }

  // Other public methods that are not called - should not interfere with RPC
  async getStatus(): Promise<string> {
    return 'OK';
  }

  async processData(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return { ...data, processed: true };
  }

  async multiply(a: number, b: number): Promise<number> {
    return a * b;
  }
}

export const TestDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    enableRpcTracePropagation: true,
  }),
  TestDurableObjectBase,
);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id: DurableObjectId = env.TEST_DURABLE_OBJECT.idFromName('test');
    const stub = env.TEST_DURABLE_OBJECT.get(id) as unknown as TestDurableObjectBase;

    if (request.url.includes('hello')) {
      const greeting = await stub.sayHello('world');
      return new Response(greeting);
    }

    return new Response('Usual response');
  },
};
