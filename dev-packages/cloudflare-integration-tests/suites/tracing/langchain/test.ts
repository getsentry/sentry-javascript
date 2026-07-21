import { expect, it } from 'vitest';
import {
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { createRunner } from '../../../runner';

// This test runs the `@langchain/openai` model (backed by the
// `openai` SDK, with a canned fetch) on the Workers runtime to verify the
// LangChain callback instrumentation works end-to-end on Cloudflare.

it('traces a LangChain chat model invocation', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as any;
      expect(transactionEvent.transaction).toBe('GET /');

      const container = envelope[1]?.[1]?.[1] as any;
      expect(container).toBeDefined();
      expect(container.items).toHaveLength(1);

      expect(container.items[0]).toEqual({
        trace_id: expect.any(String),
        span_id: expect.any(String),
        parent_span_id: expect.any(String),
        name: 'chat gpt-3.5-turbo',
        start_timestamp: expect.any(Number),
        end_timestamp: expect.any(Number),
        status: 'ok',
        is_segment: false,
        attributes: {
          'sentry.origin': { value: 'auto.ai.langchain', type: 'string' },
          'sentry.op': { value: 'gen_ai.chat', type: 'string' },
          [GEN_AI_SYSTEM_ATTRIBUTE]: { value: 'openai', type: 'string' },
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: { value: 'chat', type: 'string' },
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: { value: 'gpt-3.5-turbo', type: 'string' },
          [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: { value: 0.7, type: 'double' },
          [GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE]: { value: 100, type: 'integer' },
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: { value: '["stop"]', type: 'string' },
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: { value: 10, type: 'integer' },
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: { value: 15, type: 'integer' },
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: { value: 25, type: 'integer' },
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: { value: 'gpt-3.5-turbo', type: 'string' },
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: { value: 'chatcmpl-mock123', type: 'string' },
          [GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE]: { value: 'stop', type: 'string' },
        },
      });
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
