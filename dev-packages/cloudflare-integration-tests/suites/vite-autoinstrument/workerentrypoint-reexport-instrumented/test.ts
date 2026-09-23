import type { TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// `GreeterEntrypoint` is hand-wrapped in `./greeter` and only re-exported by
// the entry, so the transform's emitted `_INTERNAL_wrapUnlessInstrumented`
// guard must hand the manual wrap back instead of nesting a second wrapper.
// Nested entrypoint wrappers each instrument `fetch`, which shows up as extra
// spans on the entrypoint transaction, the strict shape below catches that.
it('does not double-instrument an imported, already-wrapped WorkerEntrypoint', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .unordered()
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      // The entrypoint's own transaction, child-less when wrapped exactly once.
      expect(transactionEvent.transaction).toBe('GET /greet');
      expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
      expect(transactionEvent.spans ?? []).toHaveLength(0);
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      // The auto-wrapped default export's transaction.
      expect(transactionEvent.transaction).toBe('GET /call-entrypoint');
      expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
    })
    .start(signal);

  await runner.makeRequest('get', '/call-entrypoint');
  await runner.completed();
});
