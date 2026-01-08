import { expect, it } from 'vitest';
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
              'gen_ai.operation.name': 'chat',
              'sentry.op': 'gen_ai.chat',
              'sentry.origin': 'auto.ai.langchain',
              'gen_ai.system': 'anthropic',
              'gen_ai.request.model': 'claude-3-5-sonnet-20241022',
              'gen_ai.request.temperature': 0.7,
              'gen_ai.request.max_tokens': 100,
              'gen_ai.usage.input_tokens': 10,
              'gen_ai.usage.output_tokens': 15,
              'gen_ai.usage.total_tokens': 25,
            }),
            description: 'chat claude-3-5-sonnet-20241022',
            op: 'gen_ai.chat',
            origin: 'auto.ai.langchain',
          }),
          // Chain span (without tool calls)
          expect.objectContaining({
            data: expect.objectContaining({
              'sentry.origin': 'auto.ai.langchain',
              'sentry.op': 'gen_ai.invoke_agent',
              'langchain.chain.name': 'my_test_chain',
            }),
            description: 'chain my_test_chain',
            op: 'gen_ai.invoke_agent',
            origin: 'auto.ai.langchain',
          }),
          // Tool span
          expect.objectContaining({
            data: expect.objectContaining({
              'sentry.origin': 'auto.ai.langchain',
              'sentry.op': 'gen_ai.execute_tool',
              'gen_ai.tool.name': 'search_tool',
            }),
            description: 'execute_tool search_tool',
            op: 'gen_ai.execute_tool',
            origin: 'auto.ai.langchain',
          }),
          // Chain span with tool calls (recordOutputs enabled)
          expect.objectContaining({
            data: expect.objectContaining({
              'sentry.origin': 'auto.ai.langchain',
              'sentry.op': 'gen_ai.invoke_agent',
              'langchain.chain.name': 'chain_with_tool_calls',
              'langchain.chain.outputs': expect.stringContaining('Chain execution completed'),
              'gen_ai.response.tool_calls': expect.stringContaining('search_tool'),
            }),
            description: 'chain chain_with_tool_calls',
            op: 'gen_ai.invoke_agent',
            origin: 'auto.ai.langchain',
          }),
        ]),
      );
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
