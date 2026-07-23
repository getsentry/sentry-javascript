import { SENTRY_OP } from '@sentry/conventions/attributes';
import { expect, it } from 'vitest';
import {
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { createRunner } from '../../../runner';

// This test runs the `@anthropic-ai/sdk` on the Workers runtime (with a
// canned fetch) to verify the instrumentation works end-to-end on Cloudflare,
// not just against a hand-written mock client.

it('traces a basic message creation request with the anthropic SDK', async ({ signal }) => {
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
        name: 'chat claude-3-haiku-20240307',
        start_timestamp: expect.any(Number),
        end_timestamp: expect.any(Number),
        status: 'ok',
        is_segment: false,
        attributes: {
          'sentry.origin': { value: 'auto.ai.anthropic', type: 'string' },
          [SENTRY_OP]: { value: 'gen_ai.chat', type: 'string' },
          [GEN_AI_SYSTEM_ATTRIBUTE]: { value: 'anthropic', type: 'string' },
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: { value: 'chat', type: 'string' },
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: { value: 'claude-3-haiku-20240307', type: 'string' },
          [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: { value: 0.7, type: 'double' },
          [GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE]: { value: 100, type: 'integer' },
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: { value: 'msg_mock123', type: 'string' },
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: { value: 'claude-3-haiku-20240307', type: 'string' },
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: { value: 10, type: 'integer' },
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: { value: 15, type: 'integer' },
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: { value: 25, type: 'integer' },
        },
      });
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
