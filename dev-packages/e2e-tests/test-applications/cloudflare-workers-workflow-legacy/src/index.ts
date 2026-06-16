import * as Sentry from '@sentry/cloudflare';
import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

interface Env {
  E2E_TEST_DSN: string;
  RETRY_WORKFLOW: Workflow;
}

interface WorkflowParams {
  failCount: number;
}

class RetryTestWorkflowBase extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep): Promise<string> {
    let remainingFailures = event.payload.failCount;

    await step.do(
      'failing-step',
      {
        retries: {
          limit: 2,
          delay: 100,
        },
      },
      async () => {
        if (remainingFailures > 0) {
          remainingFailures--;
          throw new Error('Intentional failure for retry test');
        }
        return 'success';
      },
    );

    return 'workflow completed';
  }
}

export const RetryTestWorkflow = Sentry.instrumentWorkflowWithSentry(
  (env: Env) => ({
    dsn: env.E2E_TEST_DSN,
    tunnel: 'http://localhost:3031/',
  }),
  RetryTestWorkflowBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.E2E_TEST_DSN,
    tunnel: 'http://localhost:3031/',
  }),
  {
    async fetch(request, env, _ctx) {
      const url = new URL(request.url);

      if (url.pathname === '/flush-marker') {
        Sentry.captureMessage('flush-marker');
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      }

      if (url.pathname === '/trigger-workflow') {
        const failCount = parseInt(url.searchParams.get('failCount') || '3', 10);

        const instance = await env.RETRY_WORKFLOW.create({
          params: { failCount },
        });

        // Poll for workflow completion
        for (let i = 0; i < 30; i++) {
          try {
            const status = await instance.status();
            if (status.status === 'complete' || status.status === 'errored') {
              return new Response(JSON.stringify({ id: instance.id, status }), {
                headers: { 'Content-Type': 'application/json' },
              });
            }
          } catch {
            // status() may not be available yet
          }
          await new Promise(r => setTimeout(r, 500));
        }

        return new Response(JSON.stringify({ id: instance.id, status: 'timeout' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('Workflow Legacy Test Worker');
    },
  } satisfies ExportedHandler<Env>,
);
