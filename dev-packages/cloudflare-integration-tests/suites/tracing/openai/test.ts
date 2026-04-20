import { expect, it } from 'vitest';
import {
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
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

it('traces a basic chat completion request', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      // Transaction item (first item in envelope)
      const transactionEvent = envelope[1]?.[0]?.[1] as any;
      expect(transactionEvent.transaction).toBe('GET /');

      // Span container item (second item in same envelope)
      const container = envelope[1]?.[1]?.[1] as any;
      expect(container).toBeDefined();

      expect(container.items).toHaveLength(1);
      const [firstSpan] = container.items;

      // [0] chat gpt-3.5-turbo
      expect(firstSpan!.name).toBe('chat gpt-3.5-turbo');
      expect(firstSpan!.status).toBe('ok');
      expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({ type: 'string', value: 'chat' });
      expect(firstSpan!.attributes['sentry.op']).toEqual({ type: 'string', value: 'gen_ai.chat' });
      expect(firstSpan!.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.ai.openai' });
      expect(firstSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'openai' });
      expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'gpt-3.5-turbo' });
      expect(firstSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]).toEqual({ type: 'double', value: 0.7 });
      expect(firstSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
        type: 'string',
        value: 'gpt-3.5-turbo',
      });
      expect(firstSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toEqual({
        type: 'string',
        value: 'chatcmpl-mock123',
      });
      expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 10 });
      expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 15 });
      expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 25 });
      expect(firstSpan!.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]).toEqual({
        type: 'string',
        value: '["stop"]',
      });
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
