import * as Sentry from '@sentry/cloudflare';
import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';

interface Env {
  SENTRY_DSN: string;
  RUN_ERRORS_WORKFLOW: Workflow;
}

interface WorkflowParams {
  mode: string;
}

export class RunErrorsTestWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep): Promise<void> {
    const { mode } = event.payload;

    if (mode === 'throw-before-step') {
      throw new TypeError('Thrown before any step');
    }

    if (mode === 'non-retryable-before-step') {
      throw new NonRetryableError('Non-retryable before any step');
    }

    if (mode === 'throw-after-step') {
      await step.do('successful-step', async () => 'done');
      throw new Error('Thrown after a successful step');
    }

    if (mode === 'wait-for-event-timeout') {
      await step.waitForEvent('wait-for-event', { type: 'never-sent', timeout: '1 second' });
    }

    if (mode === 'step-timeout') {
      await step.do('slow-step', { timeout: '1 second', retries: { limit: 0, delay: 100 } }, async () => {
        await new Promise(resolve => setTimeout(resolve, 5000));
      });
    }

    if (mode === 'non-serializable') {
      await step.do(
        'non-serializable-step',
        { retries: { limit: 0, delay: 100 } },
        (async () => () => 'function') as () => Promise<never>,
      );
    }

    if (mode === 'throw-in-step') {
      await step.do('failing-step', { retries: { limit: 0, delay: 100 } }, async () => {
        throw new Error('Thrown inside the step callback');
      });
    }

    if (mode === 'caught-step-error') {
      try {
        await step.do('failing-step', { retries: { limit: 0, delay: 100 } }, async () => {
          throw new Error('Thrown inside the step callback');
        });
      } catch {
        // The workflow goes on after the failed step
      }
    }

    if (mode === 'rethrow-new-error') {
      try {
        await step.do('failing-step', { retries: { limit: 0, delay: 100 } }, async () => {
          throw new Error('Thrown inside the step callback');
        });
      } catch {
        throw new Error('Thrown by run() after the failed step');
      }
    }
  }
}

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/trigger-workflow') {
      const instance = await env.RUN_ERRORS_WORKFLOW.create({
        params: { mode: url.searchParams.get('mode') || '' },
      });

      return Response.json({ id: instance.id });
    }

    if (url.pathname === '/flush-marker') {
      Sentry.captureMessage('flush-marker');
      return Response.json({ ok: true });
    }

    const statusMatch = url.pathname.match(/^\/workflow-status\/(.+)$/);

    if (statusMatch) {
      const instance = await env.RUN_ERRORS_WORKFLOW.get(statusMatch[1]!);

      return Response.json({ id: statusMatch[1], status: await instance.status() });
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
