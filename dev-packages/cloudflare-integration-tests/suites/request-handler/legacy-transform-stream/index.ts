import { wrapRequestHandler } from '@sentry/cloudflare/request';

interface Env {
  SENTRY_DSN: string;
}

export default {
  async fetch(request, env, ctx) {
    const contentType = new URL(request.url).searchParams.get('content-type') ?? 'text/x-component';

    return wrapRequestHandler(
      {
        options: {
          dsn: env.SENTRY_DSN,
          tracesSampleRate: 1,
        },
        request,
        context: ctx,
      },
      () => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('<div>shell</div>'));
            controller.close();
          },
        });

        return new Response(body, { headers: { 'content-type': contentType } });
      },
    );
  },
} satisfies ExportedHandler<Env>;
