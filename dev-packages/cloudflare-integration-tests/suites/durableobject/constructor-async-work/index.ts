import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  BLOCK_CONCURRENCY_DURABLE_OBJECT: DurableObjectNamespace<BlockConcurrencyDurableObject>;
  ASYNC_METHOD_DURABLE_OBJECT: DurableObjectNamespace<AsyncMethodDurableObject>;
}

export class BlockConcurrencyDurableObject extends DurableObject<Env> {
  private failure?: Error;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // The callback runs after the constructor has returned, so after the SDK has wrapped `init`.
    void ctx.blockConcurrencyWhile(async () => {
      try {
        this.init();
      } catch (error) {
        this.failure = error as Error;
      }
    });
  }

  init(): void {
    throw new Error('Init failed');
  }

  ping(): string {
    const status = this.failure ? 'degraded' : 'ok';
    Sentry.captureMessage(`block-concurrency-while ping: ${status}`);
    return status;
  }
}

export class AsyncMethodDurableObject extends DurableObject<Env> {
  private failure?: Error;
  private readonly loaded: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this.loaded = this.load();
  }

  async load(): Promise<void> {
    // Everything after the first `await` runs after the constructor has returned, so after the SDK
    // has wrapped `init`.
    await this.ctx.storage.get('config');

    try {
      this.init();
    } catch (error) {
      this.failure = error as Error;
    }
  }

  init(): void {
    throw new Error('Init failed');
  }

  async ping(): Promise<string> {
    await this.loaded;
    const status = this.failure ? 'degraded' : 'ok';
    Sentry.captureMessage(`async-method ping: ${status}`);
    return status;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/block-concurrency-while') {
      const namespace = env.BLOCK_CONCURRENCY_DURABLE_OBJECT;
      return new Response(await namespace.get(namespace.idFromName('test')).ping());
    }

    if (url.pathname === '/async-method') {
      const namespace = env.ASYNC_METHOD_DURABLE_OBJECT;
      return new Response(await namespace.get(namespace.idFromName('test')).ping());
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
