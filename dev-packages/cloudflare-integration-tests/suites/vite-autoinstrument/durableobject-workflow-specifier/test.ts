import type { TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// A fetch-invoked Durable Object emits an `http.server` transaction whose only
// children are the two `auto.db.cloudflare.durable_object` storage spans
// (`get` + `put`) — present only when the class was auto-instrumented.
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
// only when the Workflow class was wrapped with `instrumentWorkflowWithSentry`.
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

// A Durable Object and a Workflow are both exported through a single specifier
// list (`export { Counter, MyWorkflow }`) instead of inline `export class`. The
// transform renames each local class and rebinds the exported name to the
// kind-specific wrapper, so the DO storage spans and the `step-one` workflow
// transaction only arrive if the specifier form was handled for both kinds.
it('auto-instruments a Durable Object and a Workflow exported via a specifier list', async ({ signal }) => {
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
