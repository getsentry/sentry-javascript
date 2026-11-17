import * as Sentry from '@sentry/cloudflare';
import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { lastSend } from './lastSend';

interface Env {
  SERVER_URL: string;
  ISSUE_WORKFLOW: Workflow;
}

// The Workflow from https://github.com/getsentry/sentry-javascript/issues/24482. Each step flushes its span to an
// ingest that never answers. The run reports to SERVER_URL once the SDK has aborted one of those pending sends.
export class IssueWorkflow extends WorkflowEntrypoint<Env> {
  async run(_event: WorkflowEvent<unknown>, step: WorkflowStep): Promise<void> {
    lastSend.aborted = false;

    for (let index = 0; index < 100; index++) {
      await step.do(`step-${index}`, async () => index);
    }

    // The abort happens in the I/O context of a step. Resolving a promise of the run from there does not reliably
    // wake the run, so the run polls with its own timer instead.
    while (!lastSend.aborted) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await fetch(`${this.env.SERVER_URL}/result`, { method: 'POST', body: JSON.stringify({ send: 'aborted' }) });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/workflow/trigger') {
      const instance = await env.ISSUE_WORKFLOW.create();
      return Response.json({ id: instance.id });
    }

    // The flush runs inside the invocation, so the send is still pending when its drain times out.
    if (url.pathname === '/flush-with-timeout') {
      Sentry.captureException(new Error('Captured on /flush-with-timeout'));
      lastSend.aborted = false;
      const flushed = await Sentry.flush(500);
      return Response.json({ flushed, send: lastSend.aborted ? 'aborted' : 'not aborted' });
    }

    if (url.pathname === '/pending-wait-until') {
      ctx.waitUntil(new Promise(resolve => setTimeout(resolve, 120_000)));
      Sentry.captureException(new Error('Captured on /pending-wait-until'));
    }

    return new Response('ok');
  },
} satisfies ExportedHandler<Env>;
