import { expect, it } from 'vitest';
import type { Event } from '@sentry/core';
import { createRunner } from '../../../runner';

// Regression for #23040 — a Durable Object using native private fields must stay functional when
// instrumented with `enableRpcTracePropagation: true`. Native RPC dispatch (Durable Object facets,
// the Agents SDK bootstrap) invokes prototype methods with the stored instance as the receiver,
// so the instrumented instance must not be a Proxy: a Proxy does not carry the private-field
// brand and `this.#field` throws "Cannot read private member".
it('keeps native private fields working when a prototype method is invoked with the instance as receiver', async ({
  signal,
}) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;

      expect(transactionEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'rpc',
              origin: 'auto.faas.cloudflare.durable_object',
            }),
          }),
          transaction: 'bootstrap',
        }),
      );
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;

      expect(transactionEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'http.server',
              origin: 'auto.http.cloudflare',
            }),
          }),
          transaction: 'GET /prototype-dispatch',
        }),
      );
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/prototype-dispatch');
  expect(response).toBe('agent-1');

  await runner.completed();
});

it('propagates trace and preserves the result for a regular RPC method call', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;

      expect(transactionEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'rpc',
              data: expect.objectContaining({
                'sentry.origin': 'auto.faas.cloudflare.durable_object',
              }),
              origin: 'auto.faas.cloudflare.durable_object',
            }),
          }),
          transaction: 'setName',
        }),
      );
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;

      expect(transactionEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'http.server',
              origin: 'auto.http.cloudflare',
            }),
          }),
          transaction: 'GET /rpc/set-name',
        }),
      );
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/rpc/set-name');
  expect(response).toBe('agent-2');

  await runner.completed();
});
