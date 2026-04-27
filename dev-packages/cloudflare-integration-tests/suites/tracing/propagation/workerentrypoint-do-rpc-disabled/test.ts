import { expect, it } from 'vitest';
import type { Event } from '@sentry/core';
import { createRunner } from '../../../../runner';

it('does not create RPC transaction when enableRpcTracePropagation is disabled (WorkerEntrypoint)', async ({
  signal,
}) => {
  let receivedTransactions: string[] = [];

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;

      // Should only receive the worker HTTP transaction, not the DO RPC transaction
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'http.server',
              data: expect.objectContaining({
                'sentry.origin': 'auto.http.cloudflare',
              }),
              origin: 'auto.http.cloudflare',
            }),
          }),
          transaction: 'GET /rpc/hello',
        }),
      );
      receivedTransactions.push(transactionEvent.transaction as string);
    })
    .start(signal);

  // The RPC call should still work, just not be instrumented
  const response = await runner.makeRequest<string>('get', '/rpc/hello');
  expect(response).toBe('Hello, World!');

  await runner.completed();

  // Verify we only got the worker transaction, no RPC transaction
  expect(receivedTransactions).toEqual(['GET /rpc/hello']);
  expect(receivedTransactions).not.toContain('sayHello');
});
