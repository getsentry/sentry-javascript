import * as Sentry from '@sentry/cloudflare';
import { callable, routeAgentRequest } from 'agents';
import { AIChatAgent } from 'agents/ai-chat-agent';

interface Env {
  SENTRY_DSN: string;
  MyChatAgent: DurableObjectNamespace;
}

// An AIChatAgent (as opposed to a plain Agent) with a @callable method, mirroring real-world
// chat-agent setups, to verify callable-RPC spans are created through the chat agent's onMessage
// chain.
class MyChatAgentBase extends AIChatAgent<Env> {
  @callable()
  public async greet(name: string): Promise<string> {
    return `Hello, ${name}!`;
  }
}

export const MyChatAgent = Sentry.instrumentAgentWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    enableRpcTracePropagation: true,
  }),
  MyChatAgentBase,
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
