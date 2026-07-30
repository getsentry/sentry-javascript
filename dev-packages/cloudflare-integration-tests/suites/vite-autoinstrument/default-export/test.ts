import type { TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// The worker entry is a plain, unwrapped `export default {...}`. The runner
// detects `vite.config.mts`, runs `vite build`, and serves the generated output
// — so this transaction only arrives if the build-time transform wrapped the
// default export with `withSentry`.
it('auto-instruments a plain default-export handler', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      expect(transactionEvent.transaction).toBe('GET /hello');
      expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
      expect(transactionEvent.contexts?.trace?.origin).toBe('auto.http.cloudflare');
    })
    .start(signal);

  await runner.makeRequest('get', '/hello');
  await runner.completed();
});
