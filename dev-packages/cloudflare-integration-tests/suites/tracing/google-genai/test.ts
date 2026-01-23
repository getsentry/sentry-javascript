import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
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

it('traces Google GenAI chat creation and message sending', async () => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as any;

      expect(transactionEvent.transaction).toBe('GET /');
      expect(transactionEvent.spans).toEqual(
        expect.arrayContaining([
          // First span - chats.create
          expect.objectContaining({
            data: expect.objectContaining({
              [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
              [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
              [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gemini-1.5-pro',
              [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.8,
              [GEN_AI_REQUEST_TOP_P_ATTRIBUTE]: 0.9,
              [GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE]: 150,
            }),
            description: 'chat gemini-1.5-pro create',
            op: 'gen_ai.chat',
            origin: 'auto.ai.google_genai',
          }),
          // Second span - chat.sendMessage
          expect.objectContaining({
            data: expect.objectContaining({
              [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
              [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
              [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gemini-1.5-pro',
              [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 8,
              [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 12,
              [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 20,
            }),
            description: 'chat gemini-1.5-pro',
            op: 'gen_ai.chat',
            origin: 'auto.ai.google_genai',
          }),
          // Third span - models.generateContent
          expect.objectContaining({
            data: expect.objectContaining({
              [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_content',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
              [GEN_AI_SYSTEM_ATTRIBUTE]: 'google_genai',
              [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'gemini-1.5-flash',
              [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.7,
              [GEN_AI_REQUEST_TOP_P_ATTRIBUTE]: 0.9,
              [GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE]: 100,
              [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 8,
              [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 12,
              [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 20,
            }),
            description: 'generate_content gemini-1.5-flash',
            op: 'gen_ai.generate_content',
            origin: 'auto.ai.google_genai',
          }),
        ]),
      );
    })
    .start();
  await runner.makeRequest('get', '/');
  await runner.completed();
});
