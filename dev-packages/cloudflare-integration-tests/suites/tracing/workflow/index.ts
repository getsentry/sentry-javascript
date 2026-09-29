import * as Sentry from '@sentry/cloudflare';
import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  MY_WORKFLOW: Workflow;
}

class MyWorkflowBase extends WorkflowEntrypoint<Env> {
  async run(_event: WorkflowEvent<unknown>, step: WorkflowStep): Promise<void> {
    await step.do('step-one', async () => {
      return 'Step one completed';
    });

    await step.do('step-two', async () => {
      return 'Step two completed';
    });
  }
}

export const MyWorkflow = Sentry.instrumentWorkflowWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  MyWorkflowBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname === '/workflow/trigger') {
        const instance = await env.MY_WORKFLOW.create();
        for (let i = 0; i < 15; i++) {
          try {
            const s = await instance.status();
            if (s.status === 'complete' || s.status === 'errored') {
              return new Response(JSON.stringify({ id: instance.id, ...s }), {
                headers: { 'content-type': 'application/json' },
              });
            }
          } catch {
            // status() may not be available in local dev
          }
          await new Promise(r => setTimeout(r, 500));
        }
        return new Response(JSON.stringify({ id: instance.id, status: 'timeout' }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('OK');
    },
  } satisfies ExportedHandler<Env>,
);
