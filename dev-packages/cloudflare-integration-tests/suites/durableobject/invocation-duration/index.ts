import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  TEST_DURABLE_OBJECT: DurableObjectNamespace<TestDurableObject>;
  TAIL: Fetcher;
}

export class TestDurableObject extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    return new Response('OK');
  }

  async ping(): Promise<string> {
    return 'pong';
  }

  async setAlarm(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now());
  }

  async alarm(): Promise<void> {}
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/invocations') {
      return env.TAIL.fetch(request);
    }

    const stub = env.TEST_DURABLE_OBJECT.get(env.TEST_DURABLE_OBJECT.idFromName(url.pathname));

    if (url.pathname === '/rpc') {
      return new Response(await stub.ping());
    }

    if (url.pathname === '/alarm') {
      await stub.setAlarm();
      return new Response('Alarm scheduled');
    }

    return stub.fetch(request);
  },
} satisfies ExportedHandler<Env>;
