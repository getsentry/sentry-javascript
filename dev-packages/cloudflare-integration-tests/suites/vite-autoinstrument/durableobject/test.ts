import type { TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// The worker is built by the Sentry Vite plugin (auto-instrumentation on). The
// runner detects `vite.config.mts`, runs `vite build`, and serves the generated
// output — so these transactions only arrive if the build-time transform wrapped
// both the default handler and the `Counter` Durable Object.
it('auto-instruments the default handler and a Durable Object', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .unordered()
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      // Main worker's http.server transaction — proves `withSentry` wrapped the
      // unwrapped default export.
      expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
      expect(transactionEvent.contexts?.trace?.origin).toBe('auto.http.cloudflare');
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      // The Durable Object's own transaction — proves the auto-wrap applied
      // `instrumentDurableObjectWithSentry`.
      expect(transactionEvent.contexts?.trace?.origin).toBe('auto.faas.cloudflare.durable_object');
    })
    .start(signal);

  await runner.makeRequest('get', '/increment');
  await runner.completed();
});
