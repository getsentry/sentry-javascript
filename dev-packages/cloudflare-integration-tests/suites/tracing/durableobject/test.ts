import { expect, it } from 'vitest';
import type { Event } from '@sentry/core';
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

// Regression test: RPC methods that access private fields should work correctly.
// When enableRpcTracePropagation wraps the DO in a Proxy, calling methods through
// the Proxy must ensure `this` refers to the original object (not the Proxy),
// otherwise private field access throws: "Cannot read private member from an object
// whose class did not declare it"
it('allows RPC methods to access private class fields', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          transaction: 'setGreeting',
        }),
      );
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          transaction: 'sayHello',
        }),
      );
    })
    .unordered()
    .start(signal);

  // This calls setGreeting (writes private field) then sayHello (reads private field)
  // Would throw TypeError if `this` is the Proxy instead of the original object
  const response = await runner.makeRequest<string>('get', '/custom-greeting');
  expect(response).toBe('Howdy, partner');

  await runner.completed();
});
