import * as Sentry from '@sentry/cloudflare';
import { WorkerEntrypoint } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
}

interface Props {
  accountId: string;
}

class BaseEntrypoint extends WorkerEntrypoint<Env, Props> {
  inherited(value: string): string {
    return value;
  }
}

class MySubWorkerEntrypointBase extends BaseEntrypoint {
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

  get(key: string): { argumentCount: number; key: string } {
    Sentry.setTag('key', key);
    return { argumentCount: arguments.length, key };
  }

  throwError(): never {
    throw new Error('custom RPC receiver failed');
  }
}

export const BindingEntrypoint = Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    enableRpcTracePropagation: true,
    tracesSampleRate: 1.0,
    initialScope: { tags: { initial_scope: 'applied' } },
    beforeSend(event) {
      event.tags = { ...event.tags, before_send: 'applied' };
      return event;
    },
    transportOptions: { fetch: fetch.bind(globalThis) },
  }),
  MySubWorkerEntrypointBase,
);

// Instrumented like any other receiver. It is the caller that leaves this binding out of its
// targets, which is now the only way to opt a binding out of trace propagation.
export const NoPropagationEntrypoint = Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    transportOptions: { fetch: fetch.bind(globalThis) },
  }),
  MySubWorkerEntrypointBase,
);

// Deliberately not wrapped with Sentry: nothing strips a trailing RPC metadata argument here, so
// this is what a caller corrupts if it propagates to a receiver it has no guarantees about.
export class UninstrumentedEntrypoint extends WorkerEntrypoint<Env> {
  get(key: string): { argumentCount: number; key: string } {
    return { argumentCount: arguments.length, key };
  }
}

export default BindingEntrypoint;
