import * as Sentry from '@sentry/cloudflare';
import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

export class SleepWorkflow extends WorkflowEntrypoint<Env> {
  async run(_event: WorkflowEvent<unknown>, step: WorkflowStep): Promise<void> {
    for (let index = 0; index < 3; index++) {
      await step.do(`before-sleep-${index}`, async () => index);
    }

    await step.sleep('pause', '10 minutes');
    await step.do('after-sleep', async () => 'done');
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // The handler runs inside the request span the Vite plugin's `withSentry` wrapper starts, so
    // this is the `http.server` span.
    const spanContext = Sentry.getActiveSpan()?.spanContext();

    switch (url.pathname) {
      case '/test-error': {
        const eventId = Sentry.captureException(new Error('E2E test error'));
        return Response.json({ eventId, traceId: spanContext?.traceId });
      }
      case '/test-unhandled-error':
        throw new Error('E2E test unhandled error');
      case '/test-span':
        return Response.json({ spanId: spanContext?.spanId, traceId: spanContext?.traceId });
      case '/test-workflow-sleep': {
        const instance = await env.SLEEP_WORKFLOW.create({ id: crypto.randomUUID() });
        return Response.json({ instanceId: instance.id, traceId: instance.id.replace(/-/g, '') });
      }
      case '/test-workflow-status': {
        const instance = await env.SLEEP_WORKFLOW.get(url.searchParams.get('id') ?? '');
        return Response.json(await instance.status());
      }
      default:
        return new Response('Hello World!');
    }
  },
} satisfies ExportedHandler<Env>;
