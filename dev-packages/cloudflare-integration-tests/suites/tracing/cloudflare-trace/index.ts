import * as Sentry from '@sentry/cloudflare';

// `getActiveSpan` and `Span.spanContext` are newer than the installed workers types, and older runtimes do not have
// them.
interface CloudflareTracing {
  getActiveSpan?(): { isTraced?: boolean; spanContext?(): { traceId: string; spanId: string } } | undefined;
}

export default {
  async fetch(_request, _env, ctx) {
    const span = (ctx.tracing as unknown as CloudflareTracing | undefined)?.getActiveSpan?.();
    const cloudflareSpan = span?.isTraced ? (span.spanContext?.() ?? null) : null;

    Sentry.captureException(new Error('Error in a Cloudflare trace'));

    return Response.json(cloudflareSpan);
  },
} satisfies ExportedHandler;
