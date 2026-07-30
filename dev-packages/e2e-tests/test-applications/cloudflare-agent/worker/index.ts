import * as Sentry from '@sentry/cloudflare';
import { instrumentWorkersAiClient } from '@sentry/core';
import { AIChatAgent } from '@cloudflare/ai-chat';
import { Agent, callable, routeAgentRequest } from 'agents';
import { streamText } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { MockAi } from './mocks';

const MODEL = '@cf/meta/llama-3.1-8b-instruct';

const sentryOptions = (env: Env) => ({
  traceLifecycle: 'static' as const,
  dsn: env.E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`,
  tracesSampleRate: 1,
  enableRpcTracePropagation: true,
  durableObjectStorageSpanAllowlist: ['cf_user_key'],
});

/**
 * In production `env.AI` is auto-instrumented by `@sentry/cloudflare`. There is no real AI
 * binding offline, so we instrument the mock binding manually and drive it through the real
 * Vercel AI SDK + `workers-ai-provider` stack (the OpenAI-compatible SSE shape).
 */
function streamWorkersAi(): Response {
  const ai = instrumentWorkersAiClient(new MockAi(), { recordInputs: true, recordOutputs: true });
  const workersai = createWorkersAI({ binding: ai as unknown as Ai });

  const result = streamText({
    model: workersai(MODEL),
    prompt: 'What is the capital of France?',
  });

  return result.toTextStreamResponse();
}

class MyBaseAgent extends Agent<Env> {
  @callable()
  async greet(name: string): Promise<string> {
    // User keys — instrumented, spans expected
    await this.ctx.storage.put('test', 'any value');
    await this.ctx.storage.get('test');

    // Framework-internal keys (agents/partyserver/MCP OAuth conventions) — filtered, no spans expected
    await this.ctx.storage.put('cf_e2e_internal', 'bookkeeping');
    await this.ctx.storage.get('__ps_name');
    await this.ctx.storage.get('/oauth/client/token');

    // Allowlisted cf_ key — span expected
    await this.ctx.storage.get('cf_user_key');

    return `Hello, ${name}!`;
  }

  async onRequest(): Promise<Response> {
    return streamWorkersAi();
  }
}

class MyChatAgentBase extends AIChatAgent<Env> {
  @callable()
  async greet(name: string): Promise<string> {
    return `Hello, ${name}!`;
  }

  async onRequest(): Promise<Response> {
    return streamWorkersAi();
  }

  async onChatMessage(): Promise<Response> {
    // The gen_ai turn must run inside `onChatMessage` (not `onRequest`) so it happens while the
    // SDK has set the conversation id on the scope for this chat turn — that is what
    // `conversationIdIntegration` reads to stamp `gen_ai.conversation.id` onto the span.
    return streamWorkersAi();
  }
}

export const MyAgent = Sentry.instrumentAgentWithSentry(sentryOptions, MyBaseAgent);
export const MyChatAgent = Sentry.instrumentAgentWithSentry(sentryOptions, MyChatAgentBase);

export default Sentry.withSentry(sentryOptions, {
  async fetch(request: Request, env: Env): Promise<Response> {
    const agentResponse = await routeAgentRequest(request, env);

    if (agentResponse) {
      return agentResponse;
    }

    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>);
