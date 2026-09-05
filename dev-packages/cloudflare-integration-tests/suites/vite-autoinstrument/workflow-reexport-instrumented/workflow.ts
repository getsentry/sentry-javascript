import * as Sentry from '@sentry/cloudflare';
import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
}

class MyWorkflowImpl extends WorkflowEntrypoint<Env> {
  async run(_event: WorkflowEvent<unknown>, step: WorkflowStep): Promise<void> {
    await step.do('step-one', async () => 'done');
  }
}

// Manually instrumented here, in a module separate from the worker entry, which
// only imports and re-exports the wrapped class.
export const MyWorkflow = Sentry.instrumentWorkflowWithSentry(
  (env: Env) => ({ dsn: env.SENTRY_DSN, traceLifecycle: 'static', tracesSampleRate: 1.0 }),
  MyWorkflowImpl,
);
