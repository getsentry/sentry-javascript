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
      // Transaction item (first item in envelope)
      const transactionEvent = envelope[1]?.[0]?.[1] as any;
      expect(transactionEvent.transaction).toBe('GET /');

      // Span container item (second item in same envelope)
      const container = envelope[1]?.[1]?.[1] as any;
      expect(container).toBeDefined();
      expect(container.items).toHaveLength(3);
      const [firstSpan, secondSpan, thirdSpan] = container.items;

      // [0] chat claude-3-5-sonnet-20241022
      expect(firstSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
      expect(firstSpan!.status).toBe('ok');
      expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toEqual({ type: 'string', value: 'chat' });
      expect(firstSpan!.attributes['sentry.op']).toEqual({ type: 'string', value: 'gen_ai.chat' });
      expect(firstSpan!.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.ai.langchain' });
      expect(firstSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toEqual({ type: 'string', value: 'anthropic' });
      expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toEqual({
        type: 'string',
        value: 'claude-3-5-sonnet-20241022',
      });
      expect(firstSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]).toEqual({ type: 'double', value: 0.7 });
      expect(firstSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 100 });
      expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 10 });
      expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 15 });
      expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]).toEqual({ type: 'integer', value: 25 });

      // [1] chain my_test_chain
      expect(secondSpan!.name).toBe('chain my_test_chain');
      expect(secondSpan!.status).toBe('ok');
      expect(secondSpan!.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.ai.langchain' });
      expect(secondSpan!.attributes['sentry.op']).toEqual({ type: 'string', value: 'gen_ai.invoke_agent' });
      expect(secondSpan!.attributes['langchain.chain.name']).toEqual({ type: 'string', value: 'my_test_chain' });

      // [2] execute_tool search_tool
      expect(thirdSpan!.name).toBe('execute_tool search_tool');
      expect(thirdSpan!.status).toBe('ok');
      expect(thirdSpan!.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.ai.langchain' });
      expect(thirdSpan!.attributes['sentry.op']).toEqual({ type: 'string', value: 'gen_ai.execute_tool' });
      expect(thirdSpan!.attributes[GEN_AI_TOOL_NAME_ATTRIBUTE]).toEqual({ type: 'string', value: 'search_tool' });
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
