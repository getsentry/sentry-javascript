import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
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
      const transactionEvent = envelope[1]?.[0]?.[1];

      expect(transactionEvent.transaction).toBe('GET /');
      expect(transactionEvent.spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.openai',
              [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
              [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gpt-3.5-turbo',
              [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.7,
              [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-3.5-turbo',
              [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'chatcmpl-mock123',
              [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
              [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 15,
              [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 25,
              [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: '["stop"]',
            }),
            description: 'chat gpt-3.5-turbo',
            op: 'gen_ai.chat',
            origin: 'auto.ai.openai',
          }),
        ]),
      );
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
