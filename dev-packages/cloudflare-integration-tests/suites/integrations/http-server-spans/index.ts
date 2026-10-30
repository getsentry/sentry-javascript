import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

// A plain worker. The `@sentry/cloudflare/vite` plugin wraps it with `withSentry` at build time,
// with the options from `instrument.server.ts`.
export default {
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === '/health') {
      Sentry.captureMessage('Health check');
      return new Response('ok');
    }

    if (pathname === '/favicon.ico') {
      Sentry.captureMessage('Static asset');
      return new Response('icon');
    }

    if (pathname === '/health/stream') {
      // No span for this request. The message is captured after the handler returns, while the
      // body streams, so it is only sent if the SDK waits for the stream to finish.
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode('a'));
          await new Promise(resolve => setTimeout(resolve, 50));
          Sentry.captureMessage('Streamed after handler return');
          controller.enqueue(encoder.encode('b'));
          controller.close();
        },
      });
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
    }

    return new Response('ok', { status: 201 });
  },
} satisfies ExportedHandler<Env>;
