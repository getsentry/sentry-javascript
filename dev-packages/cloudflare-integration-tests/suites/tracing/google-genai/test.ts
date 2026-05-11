import { expect, it } from 'vitest';
import {
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_P_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { createRunner } from '../../../runner';

// These tests are not exhaustive because the instrumentation is
// already tested in the node integration tests and we merely
// want to test that the instrumentation does not break in our
// cloudflare SDK.

it('traces Google GenAI chat creation and message sending', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      // Transaction item (first item in envelope)
      const transactionEvent = envelope[1]?.[0]?.[1] as any;
      expect(transactionEvent.transaction).toBe('GET /');

      // Span container item (second item in same envelope)
      const container = envelope[1]?.[1]?.[1] as any;
      expect(container).toBeDefined();
      expect(container.items).toHaveLength(3);
      const [firstSpan, secondSpan, thirdSpan] = container.items;

      // [0] chat gemini-1.5-pro
      expect(firstSpan!.name).toBe('chat gemini-1.5-pro');
      expect(firstSpan!.status).toBe('ok');
      expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({ type: 'string', value: 'chat' });
      expect(firstSpan!.attributes['sentry.op']).toEqual({ type: 'string', value: 'gen_ai.chat' });
      expect(firstSpan!.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.ai.google_genai' });
      expect(firstSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'google_genai' });
      expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
        type: 'string',
        value: 'gemini-1.5-pro',
      });
      expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 8 });
      expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 12 });
      expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 20 });

      // [1] generate_content gemini-1.5-flash
      expect(secondSpan!.name).toBe('generate_content gemini-1.5-flash');
      expect(secondSpan!.status).toBe('ok');
      expect(secondSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
        type: 'string',
        value: 'generate_content',
      });
      expect(secondSpan!.attributes['sentry.op']).toEqual({ type: 'string', value: 'gen_ai.generate_content' });
      expect(secondSpan!.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.ai.google_genai' });
      expect(secondSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'google_genai' });
      expect(secondSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
        type: 'string',
        value: 'gemini-1.5-flash',
      });
      expect(secondSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]).toEqual({ type: 'double', value: 0.7 });
      expect(secondSpan!.attributes[GEN_AI_REQUEST_TOP_P_ATTRIBUTE]).toEqual({ type: 'double', value: 0.9 });
      expect(secondSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 100 });
      expect(secondSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 8 });
      expect(secondSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 12 });
      expect(secondSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 20 });

      // [2] embeddings text-embedding-004
      expect(thirdSpan!.name).toBe('embeddings text-embedding-004');
      expect(thirdSpan!.status).toBe('ok');
      expect(thirdSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({ type: 'string', value: 'embeddings' });
      expect(thirdSpan!.attributes['sentry.op']).toEqual({ type: 'string', value: 'gen_ai.embeddings' });
      expect(thirdSpan!.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.ai.google_genai' });
      expect(thirdSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'google_genai' });
      expect(thirdSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
        type: 'string',
        value: 'text-embedding-004',
      });
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
