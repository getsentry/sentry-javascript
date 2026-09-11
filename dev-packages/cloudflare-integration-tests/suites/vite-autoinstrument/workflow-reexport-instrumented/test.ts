import type { TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// `MyWorkflow` is hand-wrapped in `./workflow` and only re-exported by the
// entry, so the transform's emitted `_INTERNAL_wrapUnlessInstrumented` guard
// must hand the manual wrap back instead of nesting a second wrapper. Nested
// workflow wrappers each run the step through their own client, producing TWO
// identical `step-one` transactions, each individually well-formed, so the
// real check is the count assertion at the end.
//
// Ordering is anchored by a sentinel rather than by waiting: `/trigger`
// responds only after the workflow finished (every step envelope, including a
// duplicate, is flushed before then), and `/sentinel` is requested after that,
// so its transaction arrives a full request/response cycle behind any
// duplicate. Once the sentinel envelope has been matched, everything sent
// before it is known to have been delivered.
it('does not double-instrument an imported, already-wrapped Workflow', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .unordered()
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      expect(transactionEvent.transaction).toBe('step-one');
      expect(transactionEvent.contexts?.trace?.op).toBe('function');
      expect(transactionEvent.contexts?.trace?.origin).toBe('auto.faas.cloudflare.workflow');
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      // The auto-wrapped default export's own transaction.
      expect(transactionEvent.transaction).toBe('GET /trigger');
      expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
    })
    // The sentinel is part of the expected set, so the runner keeps everything
    // alive (and keeps receiving envelopes) until it has arrived.
    .expect(envelope => {
      expect((envelope[1]?.[0]?.[1] as TransactionEvent).transaction).toBe('GET /sentinel');
    })
    .start(signal);

  await runner.makeRequest('get', '/trigger');
  await runner.makeRequest('get', '/sentinel');
  await runner.completed();

  const stepTransactions = runner
    .getReceivedEnvelopes()
    .filter(envelope => (envelope[1]?.[0]?.[1] as TransactionEvent | undefined)?.transaction === 'step-one');
  expect(stepTransactions).toHaveLength(1);
});
