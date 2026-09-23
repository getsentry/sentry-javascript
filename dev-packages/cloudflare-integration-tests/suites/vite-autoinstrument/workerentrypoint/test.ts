import type { TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// The worker is built by the Sentry Vite plugin (auto-instrumentation on). The
// runner detects `vite.config.mts`, runs `vite build`, and serves the generated
// output — so these transactions only arrive if the build-time transform wrapped
// both the default handler and the self-bound `GreeterEntrypoint`.
it('auto-instruments the default handler and a self-bound WorkerEntrypoint', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .unordered()
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      // Main worker's http.server transaction — proves `withSentry` wrapped the
      // unwrapped default export.
      expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
      expect(transactionEvent.transaction).toBe('GET /call-entrypoint');
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      // The entrypoint's own http.server transaction — proves the auto-wrap
      // identified and wrapped the named `WorkerEntrypoint`.
      expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
      expect(transactionEvent.transaction).toBe('GET /greet');
    })
    .start(signal);

  await runner.makeRequest('get', '/call-entrypoint');
  await runner.completed();
});
