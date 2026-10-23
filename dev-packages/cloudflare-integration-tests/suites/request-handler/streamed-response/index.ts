import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

const SHELL = '<div>shell</div>';
const SUSPENDED = '<div>suspended</div>';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const contentType = url.searchParams.get('content-type');
    if (!contentType) {
      return new Response('Missing content-type', { status: 400 });
    }

    if (url.searchParams.get('body') === 'stream') {
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode(SHELL));
          // Waits for a later task, so the suspended part renders after the handler has returned.
          await new Promise(resolve => setTimeout(resolve, 0));
          Sentry.startSpan({ name: 'render' }, () => {
            controller.enqueue(encoder.encode(SUSPENDED));
          });
          controller.close();
        },
      });

      return new Response(body, { headers: { 'content-type': contentType } });
    }

    const html = Sentry.startSpan({ name: 'render' }, () => SHELL + SUSPENDED);
    const headers = new Headers({ 'content-type': contentType });
    if (url.searchParams.get('body') === 'string-with-content-length') {
      headers.set('content-length', String(new TextEncoder().encode(html).byteLength));
    }

    return new Response(html, { headers });
  },
} satisfies ExportedHandler<Env>;
