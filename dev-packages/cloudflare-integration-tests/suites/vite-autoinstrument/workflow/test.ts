import type { TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// The worker is built by the Sentry Vite plugin (auto-instrumentation on). The
// runner detects `vite.config.mts`, runs `vite build`, and serves the generated
// output — so these transactions only arrive if the build-time transform wrapped
// `MyWorkflow` with `instrumentWorkflowWithSentry` and the default export with
// `withSentry`.
//
// The workflow step and the triggering request are separate executions whose
// envelopes race, so both are expected `unordered`.
it('auto-instruments a Workflow class', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      expect(transactionEvent.transaction).toBe('step-one');
      expect(transactionEvent.contexts?.trace?.op).toBe('function');
      expect(transactionEvent.contexts?.trace?.origin).toBe('auto.faas.cloudflare.workflow');
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      expect(transactionEvent.transaction).toBe('GET /workflow/trigger');
      expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
      expect(transactionEvent.contexts?.trace?.origin).toBe('auto.http.cloudflare');
    })
    .unordered()
    .start(signal);

  await runner.makeRequest('get', '/workflow/trigger');
  await runner.completed();
});
