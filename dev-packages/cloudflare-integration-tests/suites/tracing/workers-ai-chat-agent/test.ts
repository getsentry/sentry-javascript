import { expect, it } from 'vitest';
import {
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_STREAMING_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { createRunner } from '../../../runner';

// Same as the `workers-ai-agent` suite, but driven from an `AIChatAgent` (the chat-agent
// base from `@cloudflare/ai-chat`). Guards that Workers AI streaming output is captured for
// chat agents too, which stream the OpenAI-compatible SSE shape via `workers-ai-provider`.
it('captures Workers AI streaming output when driven via an AIChatAgent', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as any;

      const genAiSpan = (transactionEvent.spans ?? []).find((span: any) => span.op === 'gen_ai.chat');

      expect(genAiSpan).toBeDefined();
      expect(genAiSpan.origin).toBe('auto.ai.cloudflare.workers_ai');
      expect(genAiSpan.data).toEqual(
        expect.objectContaining({
          'sentry.origin': 'auto.ai.cloudflare.workers_ai',
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: '@cf/meta/llama-3.1-8b-instruct',
          [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: 'The capital of France is Paris.',
          [GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]: JSON.stringify([
            { role: 'assistant', parts: [{ type: 'text', content: 'The capital of France is Paris.' }] },
          ]),
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 15,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 8,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 23,
        }),
      );
    })
    .start(signal);
  await runner.makeRequest('get', '/agents/my-chat-agent/test');
  await runner.completed();
});
