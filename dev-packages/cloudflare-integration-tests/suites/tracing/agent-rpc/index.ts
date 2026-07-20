import * as Sentry from '@sentry/cloudflare';
import { Agent, callable, routeAgentRequest } from 'agents';

interface Env {
  SENTRY_DSN: string;
  MyAgent: DurableObjectNamespace;
}

class MyAgentBase extends Agent<Env> {
  @callable()
  public async greet(name: string): Promise<string> {
    return `Hello, ${name}!`;
  }

  public async onRequest(): Promise<Response> {
    return new Response('ok');
  }
}

export const MyAgent = Sentry.instrumentAgentWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  MyAgentBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(request: Request, env: Env): Promise<Response> {
      return (await routeAgentRequest(request, env)) ?? new Response('Not found', { status: 404 });
    },
  } satisfies ExportedHandler<Env>,
);
