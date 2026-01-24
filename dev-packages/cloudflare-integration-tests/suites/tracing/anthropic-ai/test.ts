import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { expect, it } from 'vitest';
import {
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
} from '../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { createRunner } from '../../../runner';

// These tests are not exhaustive because the instrumentation is
// already tested in the node integration tests and we merely
// want to test that the instrumentation does not break in our
// cloudflare SDK.

it('traces a basic message creation request', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as any;

      expect(transactionEvent.transaction).toBe('GET /');
      expect(transactionEvent.spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.anthropic',
              [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
              [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
              [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.7,
              [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'claude-3-haiku-20240307',
              [GEN_AI_RESPONSE_ID_ATTRIBUTE]: 'msg_mock123',
              [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
              [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 15,
            }),
            description: 'chat claude-3-haiku-20240307',
            op: 'gen_ai.chat',
            origin: 'auto.ai.anthropic',
          }),
        ]),
      );
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
