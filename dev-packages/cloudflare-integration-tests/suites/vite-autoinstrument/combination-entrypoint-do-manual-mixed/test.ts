import type { TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// A Durable Object invoked via `fetch` emits an `http.server` transaction whose
// only children are the two `auto.db.cloudflare.durable_object` storage spans
// (`get` + `put`). Here they come from the manual wrap — the assertion also
// proves the transform did NOT double-wrap (a double-wrap would nest proxies or
// break the build).
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

// The Durable Object is manually wrapped with
// `Sentry.instrumentDurableObjectWithSentry`; the `GreeterEntrypoint` and the
// default export are plain. The transform must skip the manual DO (no
// double-wrap) yet still auto-wrap the entrypoint and default handler — so the
// manual DO transaction (with storage spans) and both auto-wrapped transactions
// all arrive exactly once.
it('leaves a manually wrapped Durable Object untouched while auto-wrapping a sibling WorkerEntrypoint', async ({
  signal,
}) => {
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
