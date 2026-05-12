import { expect, it } from 'vitest';
import {
  GEN_AI_AGENT_NAME_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_PIPELINE_NAME_ATTRIBUTE,
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
      // Transaction item (first item in envelope)
      const transactionEvent = envelope[1]?.[0]?.[1] as any;
      expect(transactionEvent.transaction).toBe('GET /');

      // Span container item (second item in same envelope)
      const container = envelope[1]?.[1]?.[1] as any;
      expect(container).toBeDefined();

      expect(container.items).toHaveLength(2);
      expect(container.items.map(span => span.name).sort()).toEqual([
        'create_agent weather_assistant',
        'invoke_agent weather_assistant',
      ]);

      const createAgentSpan = container.items.find(span => span.name === 'create_agent weather_assistant');
      expect(createAgentSpan).toBeDefined();
      expect(createAgentSpan!.status).toBe('ok');
      expect(createAgentSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
        type: 'string',
        value: 'create_agent',
      });
      expect(createAgentSpan!.attributes['sentry.op']).toEqual({ type: 'string', value: 'gen_ai.create_agent' });
      expect(createAgentSpan!.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.ai.langgraph' });
      expect(createAgentSpan!.attributes[GEN_AI_AGENT_NAME_ATTRIBUTE]).toEqual({
        type: 'string',
        value: 'weather_assistant',
      });

      const invokeAgentSpan = container.items.find(span => span.name === 'invoke_agent weather_assistant');
      expect(invokeAgentSpan).toBeDefined();
      expect(invokeAgentSpan!.status).toBe('ok');
      expect(invokeAgentSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
        type: 'string',
        value: 'invoke_agent',
      });
      expect(invokeAgentSpan!.attributes['sentry.op']).toEqual({ type: 'string', value: 'gen_ai.invoke_agent' });
      expect(invokeAgentSpan!.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.ai.langgraph' });
      expect(invokeAgentSpan!.attributes[GEN_AI_AGENT_NAME_ATTRIBUTE]).toEqual({
        type: 'string',
        value: 'weather_assistant',
      });
      expect(invokeAgentSpan!.attributes[GEN_AI_PIPELINE_NAME_ATTRIBUTE]).toEqual({
        type: 'string',
        value: 'weather_assistant',
      });
      expect(invokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
        type: 'string',
        value: '[{"role":"user","content":"What is the weather in SF?"}]',
      });
      expect(invokeAgentSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({
        type: 'string',
        value: 'mock-model',
      });
      expect(invokeAgentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({
        type: 'integer',
        value: 20,
      });
      expect(invokeAgentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({
        type: 'integer',
        value: 10,
      });
      expect(invokeAgentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({
        type: 'integer',
        value: 30,
      });
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
