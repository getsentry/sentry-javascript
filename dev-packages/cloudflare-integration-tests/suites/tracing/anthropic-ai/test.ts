import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// These tests are not exhaustive because the instrumentation is
// already tested in the node integration tests and we merely
// want to test that the instrumentation does not break in our
// cloudflare SDK.

it('traces a basic message creation request', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as any;

      expect(transactionEvent.transaction).toBe('GET /');
      expect(transactionEvent.spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              'gen_ai.operation.name': 'chat',
              'sentry.op': 'gen_ai.chat',
              'sentry.origin': 'auto.ai.anthropic',
              'gen_ai.system': 'anthropic',
              'gen_ai.request.model': 'claude-3-haiku-20240307',
              'gen_ai.request.temperature': 0.7,
              'gen_ai.response.model': 'claude-3-haiku-20240307',
              'gen_ai.response.id': 'msg_mock123',
              'gen_ai.usage.input_tokens': 10,
              'gen_ai.usage.output_tokens': 15,
            }),
            description: 'chat claude-3-haiku-20240307',
            op: 'gen_ai.chat',
            origin: 'auto.ai.anthropic',
          }),
        ]),
      );
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
