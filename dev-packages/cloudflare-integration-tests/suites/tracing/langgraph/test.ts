import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { expect, it } from 'vitest';
import {
  GEN_AI_AGENT_NAME_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_PIPELINE_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { createRunner } from '../../../runner';

// These tests are not exhaustive because the instrumentation is
// already tested in the node integration tests and we merely
// want to test that the instrumentation does not break in our
// cloudflare SDK.

it('traces langgraph compile and invoke operations', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as any;

      expect(transactionEvent.transaction).toBe('GET /');

      // Check create_agent span
      const createAgentSpan = transactionEvent.spans.find((span: any) => span.op === 'gen_ai.create_agent');
      expect(createAgentSpan).toMatchObject({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'create_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.create_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langgraph',
          [GEN_AI_AGENT_NAME_ATTRIBUTE]: 'weather_assistant',
        },
        description: 'create_agent weather_assistant',
        op: 'gen_ai.create_agent',
        origin: 'auto.ai.langgraph',
      });

      // Check invoke_agent span
      const invokeAgentSpan = transactionEvent.spans.find((span: any) => span.op === 'gen_ai.invoke_agent');
      expect(invokeAgentSpan).toMatchObject({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langgraph',
          [GEN_AI_AGENT_NAME_ATTRIBUTE]: 'weather_assistant',
          [GEN_AI_PIPELINE_NAME_ATTRIBUTE]: 'weather_assistant',
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: '[{"role":"user","content":"What is the weather in SF?"}]',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'mock-model',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 20,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 30,
        }),
        description: 'invoke_agent weather_assistant',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.ai.langgraph',
      });

      // Verify tools are captured
      if (invokeAgentSpan.data[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]) {
        expect(invokeAgentSpan.data[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toMatch(/get_weather/);
      }
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
