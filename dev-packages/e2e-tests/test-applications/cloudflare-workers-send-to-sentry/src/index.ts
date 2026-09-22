import * as Sentry from '@sentry/cloudflare';

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
      case '/test-workers-ai': {
        await env.AI.run('@cf/meta/llama-3.2-1b-instruct', { prompt: 'Say hi', max_tokens: 5 });
        return Response.json({ traceId: spanContext?.traceId });
      }
      case '/test-span':
        return Response.json({ spanId: spanContext?.spanId, traceId: spanContext?.traceId });
      default:
        return new Response('Hello World!');
    }
  },
} satisfies ExportedHandler<Env>;
