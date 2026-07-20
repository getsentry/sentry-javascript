import * as Sentry from '@sentry/cloudflare';
import { instrumentWorkersAiClient } from '@sentry/core';
import { Agent, routeAgentRequest } from 'agents';
import { streamText } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { MockAi } from './mocks';

interface Env {
  SENTRY_DSN: string;
  MyAgent: DurableObjectNamespace;
}

const MODEL = '@cf/meta/llama-3.1-8b-instruct';

class MyAgentBase extends Agent<Env> {
  public async onRequest(_request: Request): Promise<Response> {
    // In production `env.AI` is auto-instrumented by `@sentry/cloudflare`. There is no real
    // AI binding offline, so we instrument the mock binding manually (same as the `workers-ai`
    // suite) and drive it through the real Vercel AI SDK + `workers-ai-provider` stack.
    const ai = instrumentWorkersAiClient(new MockAi(), { recordInputs: true, recordOutputs: true });
    const workersai = createWorkersAI({ binding: ai as unknown as Ai });

    const result = streamText({
      model: workersai(MODEL),
      prompt: 'What is the capital of France?',
    });

    return result.toTextStreamResponse();
  }
}

export const MyAgent = Sentry.instrumentAgentWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    // Keep gen_ai spans embedded in the transaction (instead of streamed as a
    // separate envelope container) so they can be asserted on `transaction.spans`.
    streamGenAiSpans: false,
  }),
  MyAgentBase,
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
