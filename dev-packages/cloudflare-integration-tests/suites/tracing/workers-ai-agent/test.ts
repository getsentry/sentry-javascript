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

// Drives Workers AI through the real Cloudflare Agents SDK + Vercel AI SDK +
// `workers-ai-provider` stack. That path streams the OpenAI-compatible SSE shape
// (`choices[].delta.content`), so this asserts the response text is captured on the
// gen_ai span — the regression seen in production where only input + usage survived.
it('captures Workers AI streaming output when driven via an Agent', async ({ signal }) => {
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
          // The product reads model output from `gen_ai.output.messages`, so the streaming
          // instrumentation must emit it alongside the deprecated `gen_ai.response.text`.
          [GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]: JSON.stringify([
            { role: 'assistant', parts: [{ type: 'text', content: 'The capital of France is Paris.' }] },
          ]),
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 12,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 7,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 19,
        }),
      );
    })
    .start(signal);
  await runner.makeRequest('get', '/agents/my-agent/test');
  await runner.completed();
});
