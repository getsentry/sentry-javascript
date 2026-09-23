import type { TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// A fetch-invoked Durable Object emits an `http.server` transaction whose only
// children are the two `auto.db.cloudflare.durable_object` storage spans
// (`get` + `put`) — present only when the class is instrumented (whether by the
// manual wrap or the build-time auto-wrap).
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

// One DO (`Manual`) is wrapped by hand, the other (`Auto`) is a plain inline
// export. Both are bound in wrangler. The transform must skip the manual one and
// auto-wrap only `Auto` — so both endpoints report a storage-bearing DO
// transaction (one from the manual wrap, one from the auto wrap) without
// double-instrumenting `Manual`.
it('wraps only the unwrapped Durable Object when a sibling is manually wrapped', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .unordered()
    // One storage-bearing DO transaction from the manual wrap, one from the auto wrap.
    .expect(envelope => expectDurableObjectTransaction(envelope[1]?.[0]?.[1] as TransactionEvent))
    .expect(envelope => expectDurableObjectTransaction(envelope[1]?.[0]?.[1] as TransactionEvent))
    // One child-less main worker transaction per request.
    .expect(envelope => expectMainWorkerTransaction(envelope[1]?.[0]?.[1] as TransactionEvent))
    .expect(envelope => expectMainWorkerTransaction(envelope[1]?.[0]?.[1] as TransactionEvent))
    .start(signal);

  await runner.makeRequest('get', '/manual');
  await runner.makeRequest('get', '/auto');
  await runner.completed();
});
