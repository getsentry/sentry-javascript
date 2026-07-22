import { DurableObject, WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  COUNTER: DurableObjectNamespace;
  MY_WORKFLOW: Workflow;
}

// A Durable Object and a Workflow live in the same entry, both plain inline
// exports and neither manually wrapped. The `@sentry/cloudflare/vite` plugin's
// auto-instrumentation must wrap each with its kind-specific helper — the DO via
// `instrumentDurableObjectWithSentry`, the Workflow via
// `instrumentWorkflowWithSentry` — plus the default export via `withSentry`.
export class Counter extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    const current = ((await this.ctx.storage.get<number>('count')) ?? 0) + 1;
    await this.ctx.storage.put('count', current);
    return Response.json({ count: current });
  }
}

export class MyWorkflow extends WorkflowEntrypoint<Env> {
  async run(_event: WorkflowEvent<unknown>, step: WorkflowStep): Promise<void> {
    await step.do('step-one', async () => 'Step one completed');
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/increment') {
      const stub = env.COUNTER.get(env.COUNTER.idFromName('e2e'));
      return stub.fetch(new Request('https://do/increment'));
    }

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
