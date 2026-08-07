import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  CACHE_DO: DurableObjectNamespace;
  NO_CACHE_DO: DurableObjectNamespace;
}

/**
 * Sync KV and SQL work against the DO's own storage, which the SDK instruments into `db` spans.
 * Used to check that those spans still reach the transport from inside a Durable Object, where a
 * cached client never hits an invocation-boundary flush and has to rely on the eager drain.
 */
function runStorageOps(ctx: DurableObjectState): { listSize: number; rows: number } {
  ctx.storage.kv.put('cache-key', { hello: 'sync' });
  ctx.storage.kv.get('cache-key');
  const entries = [...ctx.storage.kv.list()];
  ctx.storage.kv.delete('cache-key');

  ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)');
  ctx.storage.sql.exec('INSERT INTO users (name) VALUES (?)', 'Alice');
  const rows = ctx.storage.sql.exec('SELECT * FROM users').toArray();

  return { listSize: entries.length, rows: rows.length };
}

function startDetachedWork(message: string): string {
  void (async () => {
    await new Promise(r => setTimeout(r, 3000));
    await Sentry.startSpan({ name: 'do.detached-task', op: 'task' }, async () => {
      Sentry.logger.info(`Detached log: ${message}`);
      Sentry.metrics.count('do.detached', 1);
      Sentry.captureException(new Error(message));
    });
  })();
  return `Detached work started: ${message}`;
}

// DO with cacheClient: true (the default) — detached work events SHOULD be captured
class CacheDurableObjectBase extends DurableObject<Env> {
  async echo(n: number): Promise<number> {
    return n;
  }

  async handlerError(instanceId: string): Promise<void> {
    throw new Error(`Cache DO handler error from ${instanceId}`);
  }

  async dedupe(): Promise<string> {
    Sentry.captureException(new Error('Same error'));
    return 'dedupe test';
  }

  async scopeCheck(seed: boolean): Promise<string> {
    if (seed) {
      Sentry.setTag('seeded_tag', 'from-seeding-call');
      Sentry.setUser({ id: 'user-from-seeding-call' });
    }
    Sentry.captureException(new Error(seed ? 'Cache scope seed' : 'Cache scope probe'));
    return 'ok';
  }

  async storage(): Promise<string> {
    const { listSize, rows } = runStorageOps(this.ctx);
    return `cache storage ${listSize}/${rows}`;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/detached') {
      return new Response(startDetachedWork(`Detached work from cache DO ${url.searchParams.get('id')}`));
    }
    if (url.pathname === '/streaming') {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('chunk1'));
          controller.enqueue(new TextEncoder().encode('chunk2'));
          controller.close();
        },
      });
      return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
    }
    return new Response('Cache DO');
  }
}

// DO with cacheClient: false — detached work events should NOT be captured
class NoCacheDurableObjectBase extends DurableObject<Env> {
  async handlerError(instanceId: string): Promise<void> {
    throw new Error(`No-cache DO handler error from ${instanceId}`);
  }

  async dedupe(): Promise<string> {
    Sentry.captureException(new Error('Same error'));
    return 'dedupe test';
  }

  async storage(): Promise<string> {
    const { listSize, rows } = runStorageOps(this.ctx);
    return `no-cache storage ${listSize}/${rows}`;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/detached') {
      return new Response(startDetachedWork(`Detached work from no-cache DO ${url.searchParams.get('id')}`));
    }
    return new Response('No-cache DO');
  }
}

export const CacheDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1,
    enableLogs: true,
    enableRpcTracePropagation: true,
  }),
  CacheDurableObjectBase,
);

export const NoCacheDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1,
    cacheClient: false,
    enableRpcTracePropagation: true,
  }),
  NoCacheDurableObjectBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1,
    enableLogs: true,
    enableRpcTracePropagation: true,
  }),
  {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      const instanceId = url.searchParams.get('id') || 'default';

      // Work that finishes AFTER the response: a post-response span tree plus a
      // log, metric and error, all registered via waitUntil. This is the worker-side
      // half of the #22545 lifecycle (the DO-side half is /detached).
      if (url.pathname === '/post-response') {
        ctx.waitUntil(
          Sentry.startSpan({ name: 'checkout.post-response', op: 'task' }, async () => {
            Sentry.logger.info('checkout post-response log');
            Sentry.metrics.count('checkout.processed', 1);
            await new Promise(r => setTimeout(r, 50));
            await Sentry.startSpan({ name: 'checkout.notify-webhook', op: 'http.client' }, async () => {
              await new Promise(r => setTimeout(r, 25));
              Sentry.captureException(new Error('Webhook delivery failed'));
            });
          }),
        );
        return new Response('checkout accepted');
      }

      // Fan a single request out into N sequential DO RPC calls — every RPC span must
      // land in this request's trace when RPC trace propagation is on.
      if (url.pathname === '/burst') {
        const n = Math.min(Number(url.searchParams.get('n')) || 1, 20);
        const stub = env.CACHE_DO.get(
          env.CACHE_DO.idFromName(`burst-${instanceId}`),
        ) as DurableObjectStub<CacheDurableObjectBase>;

        let sum = 0;
        for (let i = 0; i < n; i++) {
          sum += (await stub.echo(i)) as number;
        }
        return Response.json({ calls: n, sum });
      }

      // Cache DO RPC calls
      if (url.pathname === '/cache/handler-error') {
        const stub = env.CACHE_DO.get(
          env.CACHE_DO.idFromName(`cache-do-${instanceId}`),
        ) as DurableObjectStub<CacheDurableObjectBase>;
        await stub.handlerError(instanceId);
      }

      if (url.pathname === '/cache/dedupe') {
        const stub = env.CACHE_DO.get(
          env.CACHE_DO.idFromName(`cache-do-${instanceId}`),
        ) as DurableObjectStub<CacheDurableObjectBase>;
        const result = await stub.dedupe();
        return new Response(String(result));
      }

      if (url.pathname === '/cache/scope') {
        const stub = env.CACHE_DO.get(
          env.CACHE_DO.idFromName(`cache-do-${instanceId}`),
        ) as DurableObjectStub<CacheDurableObjectBase>;
        return new Response(await stub.scopeCheck(url.searchParams.get('seed') === '1'));
      }

      // Cache DO fetch calls — detached work goes through fetch (matching the #22545 repro),
      // since the DO fetch handler always initializes the DO's own client
      if (url.pathname === '/cache/detached') {
        const stub = env.CACHE_DO.get(
          env.CACHE_DO.idFromName(`cache-do-${instanceId}`),
        ) as DurableObjectStub<CacheDurableObjectBase>;
        return stub.fetch(new Request(`http://do/detached?id=${instanceId}`));
      }

      if (url.pathname === '/cache/storage') {
        const stub = env.CACHE_DO.get(
          env.CACHE_DO.idFromName(`cache-do-${instanceId}`),
        ) as DurableObjectStub<CacheDurableObjectBase>;
        return new Response(await stub.storage());
      }

      if (url.pathname === '/cache/streaming') {
        const stub = env.CACHE_DO.get(
          env.CACHE_DO.idFromName(`cache-do-${instanceId}`),
        ) as DurableObjectStub<CacheDurableObjectBase>;
        return stub.fetch(new Request('http://do/streaming'));
      }

      // No-cache DO calls
      if (url.pathname === '/no-cache/handler-error') {
        const stub = env.NO_CACHE_DO.get(
          env.NO_CACHE_DO.idFromName(`no-cache-do-${instanceId}`),
        ) as DurableObjectStub<NoCacheDurableObjectBase>;
        await stub.handlerError(instanceId);
      }

      if (url.pathname === '/no-cache/dedupe') {
        const stub = env.NO_CACHE_DO.get(
          env.NO_CACHE_DO.idFromName(`no-cache-do-${instanceId}`),
        ) as DurableObjectStub<NoCacheDurableObjectBase>;
        const result = await stub.dedupe();
        return new Response(String(result));
      }

      if (url.pathname === '/no-cache/storage') {
        const stub = env.NO_CACHE_DO.get(
          env.NO_CACHE_DO.idFromName(`no-cache-do-${instanceId}`),
        ) as DurableObjectStub<NoCacheDurableObjectBase>;
        return new Response(await stub.storage());
      }

      if (url.pathname === '/no-cache/detached') {
        const stub = env.NO_CACHE_DO.get(
          env.NO_CACHE_DO.idFromName(`no-cache-do-${instanceId}`),
        ) as DurableObjectStub<NoCacheDurableObjectBase>;
        return stub.fetch(new Request(`http://do/detached?id=${instanceId}`));
      }

      return new Response('Hello World!');
    },
  } satisfies ExportedHandler<Env>,
);
