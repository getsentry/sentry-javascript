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
}

// Mirrors a production setup where RPC trace propagation is enabled: the agent instance is
// wrapped in the RPC prototype-method proxy after the agent-specific hooks are installed.
export const MyAgent = Sentry.instrumentAgentWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    enableRpcTracePropagation: true,
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
