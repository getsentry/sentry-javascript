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
      const [firstSpan, secondSpan] = container.items;

      // [0] create_agent weather_assistant
      expect(firstSpan!.name).toBe('create_agent weather_assistant');
      expect(firstSpan!.status).toBe('ok');
      expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
        type: 'string',
        value: 'create_agent',
      });
      expect(firstSpan!.attributes['sentry.op']).toEqual({ type: 'string', value: 'gen_ai.create_agent' });
      expect(firstSpan!.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.ai.langgraph' });
      expect(firstSpan!.attributes[GEN_AI_AGENT_NAME_ATTRIBUTE]).toEqual({
        type: 'string',
        value: 'weather_assistant',
      });

      // [1] invoke_agent weather_assistant
      expect(secondSpan!.name).toBe('invoke_agent weather_assistant');
      expect(secondSpan!.status).toBe('ok');
      expect(secondSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({
        type: 'string',
        value: 'invoke_agent',
      });
      expect(secondSpan!.attributes['sentry.op']).toEqual({ type: 'string', value: 'gen_ai.invoke_agent' });
      expect(secondSpan!.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.ai.langgraph' });
      expect(secondSpan!.attributes[GEN_AI_AGENT_NAME_ATTRIBUTE]).toEqual({
        type: 'string',
        value: 'weather_assistant',
      });
      expect(secondSpan!.attributes[GEN_AI_PIPELINE_NAME_ATTRIBUTE]).toEqual({
        type: 'string',
        value: 'weather_assistant',
      });
      expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toEqual({
        type: 'string',
        value: '[{"role":"user","content":"What is the weather in SF?"}]',
      });
      expect(secondSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toEqual({ type: 'string', value: 'mock-model' });
      expect(secondSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 20 });
      expect(secondSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 10 });
      expect(secondSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 30 });
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
