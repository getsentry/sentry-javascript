import * as Sentry from '@sentry/cloudflare';
import { Agent, routeAgentRequest } from 'agents';

interface Env {
  SENTRY_DSN: string;
  MyAgent: DurableObjectNamespace;
}

class MyAgentBase extends Agent<Env> {
  public async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/fiber')) {
      await this.runFiber('refreshTokens', async () => {
        await new Promise<void>(resolve => setTimeout(resolve, 10));
      });
      return new Response('fiber-done');
    }

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
