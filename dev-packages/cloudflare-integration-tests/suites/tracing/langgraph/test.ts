import { expect, it } from 'vitest';
import type { SerializedStreamedSpan } from '@sentry/core';
import {
  GEN_AI_AGENT_NAME,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PIPELINE_NAME,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
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

      expect(container.items).toHaveLength(1);
      expect(container.items.map((span: SerializedStreamedSpan) => span.name).sort()).toEqual([
        'invoke_agent weather_assistant',
      ]);

      const invokeAgentSpan = container.items.find(
        (span: SerializedStreamedSpan) => span.name === 'invoke_agent weather_assistant',
      );
      expect(invokeAgentSpan).toBeDefined();
      expect(invokeAgentSpan!.status).toBe('ok');
      expect(invokeAgentSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
        type: 'string',
        value: 'invoke_agent',
      });
      expect(invokeAgentSpan!.attributes['sentry.op']).toEqual({ type: 'string', value: 'gen_ai.invoke_agent' });
      expect(invokeAgentSpan!.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.ai.langgraph' });
      expect(invokeAgentSpan!.attributes[GEN_AI_AGENT_NAME]).toEqual({
        type: 'string',
        value: 'weather_assistant',
      });
      expect(invokeAgentSpan!.attributes[GEN_AI_PIPELINE_NAME]).toEqual({
        type: 'string',
        value: 'weather_assistant',
      });
      expect(invokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toEqual({
        type: 'string',
        value: '[{"role":"user","content":"What is the weather in SF?"}]',
      });
      expect(invokeAgentSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
        type: 'string',
        value: 'mock-model',
      });
      expect(invokeAgentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
        type: 'integer',
        value: 20,
      });
      expect(invokeAgentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
        type: 'integer',
        value: 10,
      });
      expect(invokeAgentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
        type: 'integer',
        value: 30,
      });
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
