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

// Regression test for https://github.com/getsentry/sentry-javascript/issues/17127
// The RPC receiver does not implement the method error on consecutive calls
it('handles consecutive RPC calls without throwing "RPC receiver does not implement method" error', async ({
  signal,
}) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1];
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          transaction: 'sayHello',
        }),
      );
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1];
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          transaction: 'sayHello',
        }),
      );
    })
    .unordered()
    .start(signal);

  // First request - this always worked
  const response1 = await runner.makeRequest<string>('get', '/hello');
  expect(response1).toBe('Hello, world');

  // Second consecutive request - this used to fail with:
  // "The RPC receiver does not implement the method 'sayHello'"
  const response2 = await runner.makeRequest<string>('get', '/hello');
  expect(response2).toBe('Hello, world');

  await runner.completed();
});
