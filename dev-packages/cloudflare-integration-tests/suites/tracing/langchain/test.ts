import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { expect, it } from 'vitest';
import {
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_TOOL_NAME_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { createRunner } from '../../../runner';

// These tests are not exhaustive because the instrumentation is
// already tested in the node integration tests and we merely
// want to test that the instrumentation does not break in our
// cloudflare SDK.

it('traces langchain chat model, chain, and tool invocations', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as any;

      expect(transactionEvent.transaction).toBe('GET /');
      expect(transactionEvent.spans).toEqual(
        expect.arrayContaining([
          // Chat model span
          expect.objectContaining({
            data: expect.objectContaining({
              [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langchain',
              [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
              [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'claude-3-5-sonnet-20241022',
              [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.7,
              [GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE]: 100,
              [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
              [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 15,
              [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 25,
            }),
            description: 'chat claude-3-5-sonnet-20241022',
            op: 'gen_ai.chat',
            origin: 'auto.ai.langchain',
          }),
          // Chain span
          expect.objectContaining({
            data: expect.objectContaining({
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langchain',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
              'langchain.chain.name': 'my_test_chain',
            }),
            description: 'chain my_test_chain',
            op: 'gen_ai.invoke_agent',
            origin: 'auto.ai.langchain',
          }),
          // Tool span
          expect.objectContaining({
            data: expect.objectContaining({
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langchain',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.execute_tool',
              [GEN_AI_TOOL_NAME_ATTRIBUTE]: 'search_tool',
            }),
            description: 'execute_tool search_tool',
            op: 'gen_ai.execute_tool',
            origin: 'auto.ai.langchain',
          }),
        ]),
      );
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
