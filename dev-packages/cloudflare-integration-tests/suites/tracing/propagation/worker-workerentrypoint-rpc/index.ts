import * as Sentry from '@sentry/cloudflare';
import { WorkerEntrypoint } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  SUB_WORKER: Fetcher & {
    get(key: string): Promise<{ argumentCount: number; key: string }>;
    inherited(value: string): Promise<string>;
    throwError(): Promise<never>;
  };
  SUB_WORKER_NO_PROPAGATION: Fetcher & {
    get(key: string): Promise<{ argumentCount: number; key: string }>;
  };
  SUB_WORKER_UNINSTRUMENTED: Fetcher & {
    get(key: string): Promise<{ argumentCount: number; key: string }>;
  };
}

class LoopbackEntrypointBase extends WorkerEntrypoint<Env> {
  throwError(): never {
    throw new Error('loopback RPC receiver failed');
  }
}

export const LoopbackEntrypoint = Sentry.withSentry(
  (env: Env) => ({ dsn: env.SENTRY_DSN, tracesSampleRate: 0 }),
  LoopbackEntrypointBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    // Targeted by binding name. Two bindings are deliberately left out:
    // `SUB_WORKER_UNINSTRUMENTED`, whose receiver has no Sentry to strip a trailing metadata
    // argument, and `SUB_WORKER_NO_PROPAGATION`, which covers the untargeted-binding path.
    rpcTracePropagationBindings: ['SUB_WORKER'],
  }),
  {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);

      if (url.pathname === '/call-entrypoint') {
        const response = await env.SUB_WORKER.fetch(new Request('http://fake-host/answer'));
        const text = await response.text();
        return new Response(text);
      }

      if (url.pathname === '/call-entrypoint-greet') {
        const response = await env.SUB_WORKER.fetch(new Request('http://fake-host/greet?name=World'));
        const text = await response.text();
        return new Response(text);
      }

      if (url.pathname === '/call-entrypoint-rpc') {
        const result = await env.SUB_WORKER.get('feature-key');
        const inherited = await env.SUB_WORKER.inherited('base-value');
        return Response.json({ inherited, ...result });
      }

      if (url.pathname === '/call-entrypoint-rpc-error') {
        try {
          await env.SUB_WORKER.throwError();
        } catch {
          return new Response('fallback');
        }
      }

      if (url.pathname === '/call-uninstrumented-rpc') {
        return Response.json(await env.SUB_WORKER_UNINSTRUMENTED.get('uninstrumented-key'));
      }

      if (url.pathname === '/call-entrypoint-rpc-no-propagation') {
        const result = await env.SUB_WORKER_NO_PROPAGATION.get('no-prop-key');
        return Response.json(result);
      }

      if (url.pathname === '/call-loopback-rpc-error') {
        try {
          await (
            ctx as unknown as { exports: { LoopbackEntrypoint: { throwError(): Promise<never> } } }
          ).exports.LoopbackEntrypoint.throwError();
        } catch {
          return new Response('fallback');
        }
      }

      return new Response('Not found', { status: 404 });
    },
  } satisfies ExportedHandler<Env>,
);
