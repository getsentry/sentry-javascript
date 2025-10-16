import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// These tests are not exhaustive because the instrumentation is
// already tested in the node integration tests and we merely
// want to test that the instrumentation does not break in our
// cloudflare SDK.

it('traces a basic chat completion request', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1];

      expect(transactionEvent.transaction).toBe('GET /');
      expect(transactionEvent.spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              'gen_ai.operation.name': 'chat',
              'sentry.op': 'gen_ai.chat',
              'sentry.origin': 'auto.ai.openai',
              'gen_ai.system': 'openai',
              'gen_ai.request.model': 'gpt-3.5-turbo',
              'gen_ai.request.temperature': 0.7,
              'gen_ai.response.model': 'gpt-3.5-turbo',
              'gen_ai.response.id': 'chatcmpl-mock123',
              'gen_ai.usage.input_tokens': 10,
              'gen_ai.usage.output_tokens': 15,
              'gen_ai.usage.total_tokens': 25,
              'gen_ai.response.finish_reasons': '["stop"]',
            }),
            description: 'chat gpt-3.5-turbo',
            op: 'gen_ai.chat',
            origin: 'auto.ai.openai',
          }),
        ]),
      );
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
