import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/bun';

Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 1 });

const server = Bun.serve({
  port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/error') {
      throw new Error('handler failed');
    }
    const span = Sentry.getActiveSpan();
    const body = new ReadableStream({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode('data: first\n\n'));
        await Bun.sleep(50);
        if (path === '/stream-error') {
          controller.error(new Error('stream failed'));
          return;
        }
        controller.enqueue(new TextEncoder().encode(`data: recording=${span?.isRecording()}\n\n`));
        span?.setAttribute('test.stream.completed', true);
        controller.close();
      },
    });
    return new Response(body, { status: 201, headers: { 'content-type': 'text/event-stream' } });
  },
  error() {
    return new Response('failed', { status: 500 });
  },
});
sendPortToRunner(server.port!);
