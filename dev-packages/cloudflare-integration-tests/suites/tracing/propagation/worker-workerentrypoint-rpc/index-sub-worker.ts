import * as Sentry from '@sentry/cloudflare';
import { WorkerEntrypoint } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
}

class MySubWorkerEntrypointBase extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/answer') {
      return new Response('The answer is 42');
    }

    if (url.pathname === '/greet') {
      const name = url.searchParams.get('name') || 'Anonymous';
      return new Response(`Hello, ${name}!`);
    }

    return new Response('Not found', { status: 404 });
  }
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    enableRpcTracePropagation: true,
  }),
  MySubWorkerEntrypointBase,
);
