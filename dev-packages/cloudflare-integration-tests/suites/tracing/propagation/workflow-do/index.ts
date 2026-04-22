import * as Sentry from '@sentry/cloudflare';
import { DurableObject, WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  MY_DURABLE_OBJECT: DurableObjectNamespace;
  MY_WORKFLOW: Workflow;
}

class MyDurableObjectBase extends DurableObject<Env> {
  async fetch(_request: Request) {
    return new Response('DO is fine');
  }
}

export const MyDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  MyDurableObjectBase,
);

class MyWorkflowBase extends WorkflowEntrypoint<Env> {
  async run(_event: WorkflowEvent<unknown>, step: WorkflowStep): Promise<void> {
    await step.do('workflow-env-test', async () => {
      const id = this.env.MY_DURABLE_OBJECT.idFromName('workflow-test');
      const stub = this.env.MY_DURABLE_OBJECT.get(id);
      const response = await stub.fetch(new Request('http://fake-host/workflow-test'));
      return response.text();
    });
  }
}

export const MyWorkflow = Sentry.instrumentWorkflowWithSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    enableRpcTracePropagation: true,
  }),
  MyWorkflowBase,
);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    enableRpcTracePropagation: true,
  }),
  {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname === '/workflow/trigger') {
        const instance = await env.MY_WORKFLOW.create();
        // Poll until workflow completes (or timeout after 15s)
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
          await new Promise(r => setTimeout(r, 1000));
        }
        return new Response(JSON.stringify({ id: instance.id, status: 'timeout' }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('Hello World!');
    },
  } satisfies ExportedHandler<Env>,
);
