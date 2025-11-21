import { expect, it } from 'vitest';
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
          'gen_ai.operation.name': 'create_agent',
          'sentry.op': 'gen_ai.create_agent',
          'sentry.origin': 'auto.ai.langgraph',
          'gen_ai.agent.name': 'weather_assistant',
        },
        description: 'create_agent weather_assistant',
        op: 'gen_ai.create_agent',
        origin: 'auto.ai.langgraph',
      });

      // Check invoke_agent span
      const invokeAgentSpan = transactionEvent.spans.find((span: any) => span.op === 'gen_ai.invoke_agent');
      expect(invokeAgentSpan).toMatchObject({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'invoke_agent',
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.ai.langgraph',
          'gen_ai.agent.name': 'weather_assistant',
          'gen_ai.pipeline.name': 'weather_assistant',
          'gen_ai.request.messages': '[{"role":"user","content":"What is the weather in SF?"}]',
          'gen_ai.response.model': 'mock-model',
          'gen_ai.usage.input_tokens': 20,
          'gen_ai.usage.output_tokens': 10,
          'gen_ai.usage.total_tokens': 30,
        }),
        description: 'invoke_agent weather_assistant',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.ai.langgraph',
      });

      // Verify tools are captured
      if (invokeAgentSpan.data['gen_ai.request.available_tools']) {
        expect(invokeAgentSpan.data['gen_ai.request.available_tools']).toMatch(/get_weather/);
      }
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
