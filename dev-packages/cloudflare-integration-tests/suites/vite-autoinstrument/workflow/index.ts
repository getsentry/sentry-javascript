import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  MY_WORKFLOW: Workflow;
}

// Neither the Workflow class nor the default handler is manually wrapped. The
// `@sentry/cloudflare/vite` plugin's auto-instrumentation wraps both at build
// time — `MyWorkflow` via `instrumentWorkflowWithSentry`, the default export
// via `withSentry`.
export class MyWorkflow extends WorkflowEntrypoint<Env> {
  async run(_event: WorkflowEvent<unknown>, step: WorkflowStep): Promise<void> {
    await step.do('step-one', async () => 'Step one completed');
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/workflow/trigger') {
      const instance = await env.MY_WORKFLOW.create();
      for (let i = 0; i < 15; i++) {
        try {
          const s = await instance.status();
          if (s.status === 'complete' || s.status === 'errored') {
            return Response.json({ id: instance.id, ...s });
          }
        } catch {
          // status() may not be available in local dev
        }
        await new Promise(r => setTimeout(r, 500));
      }
      return Response.json({ id: instance.id, status: 'timeout' });
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
