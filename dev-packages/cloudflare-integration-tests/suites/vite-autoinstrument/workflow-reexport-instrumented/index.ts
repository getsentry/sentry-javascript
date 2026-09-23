import { MyWorkflow } from './workflow';

interface Env {
  SENTRY_DSN: string;
  MY_WORKFLOW: Workflow;
}

// `MyWorkflow` was already wrapped by hand in `./workflow`. The auto-instrument
// transform cannot see that from this entry, so it emits its wrapper behind
// `_INTERNAL_wrapUnlessInstrumented`, which hands the manual wrap back unchanged
// instead of nesting a second wrapper around it.
export { MyWorkflow };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Issued by the test after `/trigger` returned, its transaction is the
    // sentinel proving every earlier envelope (including a duplicate step
    // transaction from an accidental double wrap) has been delivered.
    if (url.pathname === '/sentinel') {
      return new Response('ok');
    }

    if (url.pathname === '/trigger') {
      const instance = await env.MY_WORKFLOW.create();
      // Respond only once the workflow finished, so every step envelope (including
      // a duplicate from an accidental double wrap) is sent before this request's
      // own transaction completes the test's expectations.
      for (let i = 0; i < 20; i++) {
        try {
          const s = await instance.status();
          if (s.status === 'complete' || s.status === 'errored') {
            return Response.json({ id: instance.id, ...s });
          }
        } catch {
          // status() may not be available in local dev
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      return Response.json({ id: instance.id, status: 'timeout' });
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
