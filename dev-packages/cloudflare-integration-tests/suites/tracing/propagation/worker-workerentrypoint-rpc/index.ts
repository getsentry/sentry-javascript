import * as Sentry from '@sentry/cloudflare';
import { WorkerEntrypoint, exports as workerExports } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  SUB_WORKER: Fetcher & {
    get(key: string): Promise<{ argumentCount: number; key: string }>;
    inherited(value: string): Promise<string>;
    throwError(): Promise<never>;
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
    enableRpcTracePropagation: true,
  }),
  {
    async fetch(request, env) {
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

      if (url.pathname === '/call-loopback-rpc-error') {
        try {
          await (
            workerExports as unknown as { LoopbackEntrypoint: { throwError(): Promise<never> } }
          ).LoopbackEntrypoint.throwError();
        } catch {
          return new Response('fallback');
        }
      }

      return new Response('Not found', { status: 404 });
    },
  } satisfies ExportedHandler<Env>,
);
