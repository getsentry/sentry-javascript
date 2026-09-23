import { expect, it } from 'vitest';
import type { Event } from '@sentry/core';
import { createRunner } from '../../../../runner';

it('does not trace an RPC method call when rpcTracePropagationBindings is empty (WorkerEntrypoint)', async ({
  signal,
}) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;

      expect(transactionEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({ op: 'http.server' }),
          }),
          transaction: 'GET /rpc/hello',
        }),
      );
    })
    // Ordered: a `sayHello` transaction from the receiver would arrive here and fail this
    // expectation. Without the trailing Sentry argument the receiver never traces the call.
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;

      expect(transactionEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({ op: 'http.server' }),
          }),
          transaction: 'GET /sentinel',
        }),
      );
    })
    .start(signal);

  expect(await runner.makeRequest<string>('get', '/rpc/hello')).toBe('Hello, World!');
  expect(await runner.makeRequest<string>('get', '/sentinel')).toBe('Sentinel');

  await runner.completed();
});
