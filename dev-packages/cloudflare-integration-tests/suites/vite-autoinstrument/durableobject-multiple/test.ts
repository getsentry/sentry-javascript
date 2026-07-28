import type { TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// A fetch-invoked Durable Object emits an `http.server` transaction whose only
// children are the two `auto.db.cloudflare.durable_object` storage spans
// (`get` + `put`) — present only when the class was actually auto-instrumented.
function expectDurableObjectTransaction(transactionEvent: TransactionEvent): void {
  expect(transactionEvent).toEqual(
    expect.objectContaining({
      contexts: expect.objectContaining({
        trace: expect.objectContaining({ op: 'http.server', origin: 'auto.http.cloudflare' }),
      }),
    }),
  );
  expect(transactionEvent.spans).toHaveLength(2);
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

// The main worker transaction just forwards to the DO, so it carries no child
// spans. The empty-spans assertion keeps it disjoint from the DO transactions.
function expectMainWorkerTransaction(transactionEvent: TransactionEvent): void {
  expect(transactionEvent).toEqual(
    expect.objectContaining({
      contexts: expect.objectContaining({
        trace: expect.objectContaining({ op: 'http.server', origin: 'auto.http.cloudflare' }),
      }),
    }),
  );
  expect(transactionEvent.spans).toHaveLength(0);
}

// Two Durable Object classes are bound in wrangler. Hitting both must produce a
// storage-bearing DO transaction for each, proving the transform wrapped every
// configured class rather than stopping after the first match.
it('auto-instruments multiple Durable Object classes in one entry', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .unordered()
    // One storage-bearing DO transaction per configured class.
    .expect(envelope => expectDurableObjectTransaction(envelope[1]?.[0]?.[1] as TransactionEvent))
    .expect(envelope => expectDurableObjectTransaction(envelope[1]?.[0]?.[1] as TransactionEvent))
    // One child-less main worker transaction per request.
    .expect(envelope => expectMainWorkerTransaction(envelope[1]?.[0]?.[1] as TransactionEvent))
    .expect(envelope => expectMainWorkerTransaction(envelope[1]?.[0]?.[1] as TransactionEvent))
    .start(signal);

  await runner.makeRequest('get', '/increment-a');
  await runner.makeRequest('get', '/increment-b');
  await runner.completed();
});
