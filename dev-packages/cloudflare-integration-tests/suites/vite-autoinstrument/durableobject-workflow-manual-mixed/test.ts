import type { TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// A fetch-invoked Durable Object emits an `http.server` transaction whose only
// children are the two `auto.db.cloudflare.durable_object` storage spans
// (`get` + `put`) — present here because the class was manually wrapped.
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

// A workflow step runs in its own invocation and reports a `function.step.do` /
// `auto.faas.cloudflare.workflow` transaction named after the step — present
// only because the transform auto-wrapped the Workflow class.
function expectWorkflowStepTransaction(transactionEvent: TransactionEvent): void {
  expect(transactionEvent.transaction).toBe('step-one');
  expect(transactionEvent.contexts?.trace?.op).toBe('function.step.do');
  expect(transactionEvent.contexts?.trace?.origin).toBe('auto.faas.cloudflare.workflow');
}

// The main worker transaction for `/increment` just forwards to the DO, so it
// carries no child spans. The empty-spans assertion keeps it disjoint from the
// DO and workflow transactions regardless of arrival order.
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

// The Durable Object is wrapped by hand with `instrumentDurableObjectWithSentry`
// while the Workflow sibling is a plain inline export. The transform must match
// the manual wrap by its DO-kind method and skip it (no double-wrap) while still
// auto-wrapping the Workflow with `instrumentWorkflowWithSentry`. We therefore
// expect a storage-bearing DO transaction (manual wrap) and a `step-one`
// transaction (auto wrap), plus the child-less main worker transaction.
it('leaves a manually wrapped Durable Object untouched and still auto-wraps a Workflow sibling', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .unordered()
    .expect(envelope => expectDurableObjectTransaction(envelope[1]?.[0]?.[1] as TransactionEvent))
    .expect(envelope => expectWorkflowStepTransaction(envelope[1]?.[0]?.[1] as TransactionEvent))
    .expect(envelope => expectMainWorkerTransaction(envelope[1]?.[0]?.[1] as TransactionEvent))
    .start(signal);

  await runner.makeRequest('get', '/increment');
  await runner.makeRequest('get', '/workflow/trigger');
  await runner.completed();
});
