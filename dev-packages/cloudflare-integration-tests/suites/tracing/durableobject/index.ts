import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  TEST_DURABLE_OBJECT: DurableObjectNamespace;
}

// Regression test for https://github.com/getsentry/sentry-javascript/issues/17127
// This class mimics a real-world DO with private fields/methods and multiple public methods
class TestDurableObjectBase extends DurableObject<Env> {
  // Private field used by RPC methods - tests that private fields work with instrumentation
  #greeting = 'Hello';

  public constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  // RPC method that uses a private field - this would throw TypeError if the Proxy
  // doesn't correctly bind `this` to the original object
  async sayHello(name: string): Promise<string> {
    return `${this.#greeting}, ${name}`;
  }

  // RPC method that modifies a private field
  async setGreeting(greeting: string): Promise<void> {
    this.#greeting = greeting;
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

    // Test endpoint that modifies and reads a private field via RPC
    if (request.url.includes('custom-greeting')) {
      await stub.setGreeting('Howdy');
      const greeting = await stub.sayHello('partner');
      return new Response(greeting);
    }

    return new Response('Usual response');
  },
};
