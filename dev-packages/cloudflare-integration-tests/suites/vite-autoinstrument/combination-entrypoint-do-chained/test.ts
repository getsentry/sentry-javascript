import type { TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// The Durable Object, reached from inside the entrypoint, emits an `http.server`
// transaction whose only children are the two
// `auto.db.cloudflare.durable_object` storage spans (`get` + `put`) — present
// only when the class was auto-instrumented.
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

function expectPlainTransaction(name: string) {
  return (transactionEvent: TransactionEvent): void => {
    expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
    expect(transactionEvent.contexts?.trace?.origin).toBe('auto.http.cloudflare');
    expect(transactionEvent.transaction).toBe(name);
    expect(transactionEvent.spans).toHaveLength(0);
  };
}

// A single request fans out through the whole auto-wrapped chain: default
// handler (`/chain`) → self-bound `CounterEntrypoint` (`/work`) → `Counter`
// Durable Object. All three transactions arrive only if the build-time transform
// wrapped the default export, the entrypoint, and the DO — and it proves a DO
// invoked from *within* an auto-instrumented entrypoint is itself instrumented.
it('auto-instruments a Durable Object invoked from within a WorkerEntrypoint', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .unordered()
    .expect(envelope => expectPlainTransaction('GET /chain')(envelope[1]?.[0]?.[1] as TransactionEvent))
    .expect(envelope => expectPlainTransaction('GET /work')(envelope[1]?.[0]?.[1] as TransactionEvent))
    .expect(envelope => expectDurableObjectTransaction(envelope[1]?.[0]?.[1] as TransactionEvent))
    .start(signal);

  await runner.makeRequest('get', '/chain');
  await runner.completed();
});
