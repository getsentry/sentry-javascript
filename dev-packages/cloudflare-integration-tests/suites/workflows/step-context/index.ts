import * as Sentry from '@sentry/cloudflare';
import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  STEP_CONTEXT_WORKFLOW: Workflow;
}

interface WorkflowParams {
  failCount: number;
  captureManual?: boolean;
}
class StepContextTestWorkflowBase extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep): Promise<void> {
    let remainingFailures = event.payload.failCount;

    const result = await step.do(
      'failing-step',
      {
        retries: {
          limit: 2,
          delay: 100,
        },
      },
      async ctx => {
        if (event.payload.captureManual) {
          Sentry.captureException(new Error(`Manual capture on attempt ${ctx.attempt}`));
        }

        if (remainingFailures > 0) {
          remainingFailures--;
          throw new Error('Intentional failure for retry test');
        }
      },
    );

    return result;
  }
}

export const StepContextTestWorkflow = Sentry.instrumentWorkflowWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
  }),
  StepContextTestWorkflowBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
  }),
  {
    async fetch(request, env, _ctx) {
      const url = new URL(request.url);

      if (url.pathname === '/trigger-workflow') {
        const failCount = parseInt(url.searchParams.get('failCount') || '0', 10);
        const captureManual = url.searchParams.get('captureManual') === 'true';

        try {
          const instance = await env.STEP_CONTEXT_WORKFLOW.create({
            params: { failCount, captureManual },
          });

          return new Response(JSON.stringify({ id: instance.id }), { headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
          return new Response(JSON.stringify({ error: 'Failed to create workflow', details: String(e) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      if (url.pathname === '/flush-marker') {
        Sentry.captureMessage('flush-marker');
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      }

      const statusMatch = url.pathname.match(/^\/workflow-status\/(.+)$/);

      if (statusMatch) {
        const workflowId = statusMatch[1];

        try {
          const instance = await env.STEP_CONTEXT_WORKFLOW.get(workflowId!);
          const status = await instance.status();

          return new Response(
            JSON.stringify({
              id: workflowId,
              status,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          );
        } catch (e) {
          return new Response(JSON.stringify({ error: 'Failed to get workflow status', details: String(e) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response('Step Context Test Worker');
    },
  } satisfies ExportedHandler<Env>,
);
