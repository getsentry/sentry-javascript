import type { TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// The worker is built by the Sentry Vite plugin (auto-instrumentation on). The
// runner detects `vite.config.mts`, runs `vite build`, and serves the generated
// output — so a workflow-step transaction only arrives if the build-time
// transform wrapped `MyWorkflow` with `instrumentWorkflowWithSentry`.
it('auto-instruments a Workflow class', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      expect(transactionEvent.transaction).toBe('step-one');
      expect(transactionEvent.contexts?.trace?.op).toBe('function.step.do');
      expect(transactionEvent.contexts?.trace?.origin).toBe('auto.faas.cloudflare.workflow');
    })
    .start(signal);

  await runner.makeRequest('get', '/workflow/trigger');
  await runner.completed();
});
