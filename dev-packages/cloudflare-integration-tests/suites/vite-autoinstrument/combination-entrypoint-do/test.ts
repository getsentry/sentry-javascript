import type { TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// A Durable Object invoked via `fetch` emits an `http.server` transaction whose
// only children are the two `auto.db.cloudflare.durable_object` storage spans
// (`get` + `put`) — present only when the class was auto-instrumented.
function expectDurableObjectTransaction(transactionEvent: TransactionEvent): void {
  expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
  expect(transactionEvent.contexts?.trace?.origin).toBe('auto.http.cloudflare');
  expect(transactionEvent.spans).toEqual([
    expect.objectContaining({
      op: 'db',
      description: 'durable_object_storage_get',
      origin: 'auto.db.cloudflare.durable_object',
    }),
    expect.objectContaining({
      op: 'db',
      description: 'durable_object_storage_put',
      origin: 'auto.db.cloudflare.durable_object',
    }),
  ]);
}

// A plain `http.server` transaction with no child spans, identified by its
// transaction name. Used for the two main-worker entries and the entrypoint —
// asserting the name keeps each expectation disjoint under unordered matching.
function expectPlainTransaction(name: string) {
  return (transactionEvent: TransactionEvent): void => {
    expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
    expect(transactionEvent.contexts?.trace?.origin).toBe('auto.http.cloudflare');
    expect(transactionEvent.transaction).toBe(name);
    expect(transactionEvent.spans).toHaveLength(0);
  };
}

// A single worker exports a plain `WorkerEntrypoint`, a plain `DurableObject`,
// and a plain default handler. The runner builds it with the Sentry Vite plugin
// (auto-instrumentation on) and serves the output — so every transaction below
// only arrives if the build-time transform wrapped all three: `withSentry` for
// the default export, the self-bound `GreeterEntrypoint`, and `Counter` via
// `instrumentDurableObjectWithSentry`.
it('auto-instruments a WorkerEntrypoint and a Durable Object exported from the same worker', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .unordered()
    .expect(envelope => expectPlainTransaction('GET /call-entrypoint')(envelope[1]?.[0]?.[1] as TransactionEvent))
    .expect(envelope => expectPlainTransaction('GET /greet')(envelope[1]?.[0]?.[1] as TransactionEvent))
    .expect(envelope => expectPlainTransaction('GET /increment')(envelope[1]?.[0]?.[1] as TransactionEvent))
    .expect(envelope => expectDurableObjectTransaction(envelope[1]?.[0]?.[1] as TransactionEvent))
    .start(signal);

  await runner.makeRequest('get', '/call-entrypoint');
  await runner.makeRequest('get', '/increment');
  await runner.completed();
});
