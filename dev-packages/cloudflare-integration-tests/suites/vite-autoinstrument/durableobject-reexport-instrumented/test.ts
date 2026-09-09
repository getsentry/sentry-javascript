import type { TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// A fetch-invoked Durable Object emits an `http.server` transaction whose only
// children are the two `auto.db.cloudflare.durable_object` storage spans
// (`get` + `put`) — present only when the class is instrumented.
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
// spans. The empty-spans assertion keeps it disjoint from the DO transaction.
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

// `Counter` is manually wrapped with `instrumentDurableObjectWithSentry` in a
// separate module (`./counter`), imported into the entry, and re-exported via a
// plain `export { Counter }`. The transform sees only the imported binding, so it
// emits its wrapper behind `_INTERNAL_wrapUnlessInstrumented`, which recognizes
// the hand-wrapped class and hands it straight back. Without that guard the two
// wrappers nest and every storage call reports twice, so the exactly-two span
// assertion below is the real check. The DO stays instrumented via the manual
// wrap, alongside the auto-wrapped default export's child-less transaction.
it('does not double-instrument an imported, already-wrapped Durable Object and still wraps the default export', async ({
  signal,
}) => {
  const runner = createRunner(__dirname)
    .unordered()
    .expect(envelope => expectDurableObjectTransaction(envelope[1]?.[0]?.[1] as TransactionEvent))
    .expect(envelope => expectMainWorkerTransaction(envelope[1]?.[0]?.[1] as TransactionEvent))
    .start(signal);

  await runner.makeRequest('get', '/increment');
  await runner.completed();
});
