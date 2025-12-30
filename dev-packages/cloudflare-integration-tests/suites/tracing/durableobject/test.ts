import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

it('traces a durable object method', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1];
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'rpc',
              data: expect.objectContaining({
                'sentry.op': 'rpc',
                'sentry.origin': 'auto.faas.cloudflare.durable_object',
              }),
              origin: 'auto.faas.cloudflare.durable_object',
            }),
          }),
          transaction: 'sayHello',
        }),
      );
    })
    .start(signal);
  await runner.makeRequest('get', '/hello');
  await runner.completed();
});
