import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  SLEEP_WORKFLOW: Workflow;
}

export class SleepWorkflow extends WorkflowEntrypoint<Env> {
  async run(_event: WorkflowEvent<unknown>, step: WorkflowStep): Promise<void> {
    await step.do('before-sleep', async () => 'done');
    await step.sleep('pause', '1 hour');
    await step.do('after-sleep', async () => 'done');
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/workflow/trigger') {
      const instance = await env.SLEEP_WORKFLOW.create();
      return Response.json({ id: instance.id });
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
