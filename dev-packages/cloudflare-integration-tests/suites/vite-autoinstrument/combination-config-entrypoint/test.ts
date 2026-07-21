import type { TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// The named `AdminEntrypoint` extends a base class imported from another module,
// so structural detection can't identify it — only the wrangler config's
// `services[].entrypoint` self-binding does. Both the default handler and the
// entrypoint are wrapped in a single Vite build; each produces a transaction.
it('auto-instruments a config-identified WorkerEntrypoint alongside the default handler', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .unordered()
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      expect(transactionEvent.transaction).toBe('GET /call-entrypoint');
      expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      expect(transactionEvent.transaction).toBe('GET /admin');
      expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
    })
    .start(signal);

  await runner.makeRequest('get', '/call-entrypoint');
  await runner.completed();
});
