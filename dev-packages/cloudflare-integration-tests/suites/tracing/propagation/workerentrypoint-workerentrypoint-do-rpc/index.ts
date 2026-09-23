import * as Sentry from '@sentry/cloudflare';
import { WorkerEntrypoint } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  SUB_WORKER: Fetcher;
}

class MyWorkerEntrypointBase extends WorkerEntrypoint {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/chain') {
      const response = await (this.env as Env).SUB_WORKER.fetch(new Request('http://fake-host/call-do'));
      const text = await response.text();
      return new Response(text);
    }

    return new Response('Not found', { status: 404 });
  }
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    traceLifecycle: 'static',
    tracesSampleRate: 1.0,
    rpcTracePropagationBindings: ['SUB_WORKER'],
  }),
  MyWorkerEntrypointBase,
);
