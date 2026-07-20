import * as Sentry from '@sentry/cloudflare';
import { instrumentWorkersAiClient } from '@sentry/core';
import { routeAgentRequest } from 'agents';
import { AIChatAgent } from 'agents/ai-chat-agent';
import { streamText } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { MockAi } from './mocks';

interface Env {
  SENTRY_DSN: string;
  MyChatAgent: DurableObjectNamespace;
}

const MODEL = '@cf/meta/llama-3.1-8b-instruct';

class MyChatAgentBase extends AIChatAgent<Env> {
  public async onChatMessage(): Promise<Response> {
    // The gen_ai turn must run inside `onChatMessage` (not `onRequest`) so it happens while the
    // SDK has set the conversation id on the scope for this chat turn — that is what
    // `conversationIdIntegration` reads to stamp `gen_ai.conversation.id` onto the span below.
    const ai = instrumentWorkersAiClient(new MockAi(), { recordInputs: true, recordOutputs: true });
    const workersai = createWorkersAI({ binding: ai as unknown as Ai });

    const result = streamText({
      model: workersai(MODEL),
      prompt: 'What is the capital of France?',
    });

    return result.toTextStreamResponse();
  }
}

export const MyChatAgent = Sentry.instrumentAgentWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    streamGenAiSpans: false,
  }),
  MyChatAgentBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    streamGenAiSpans: false,
  }),
  {
    async fetch(request: Request, env: Env): Promise<Response> {
      return (await routeAgentRequest(request, env)) ?? new Response('Not found', { status: 404 });
    },
  } satisfies ExportedHandler<Env>,
);
