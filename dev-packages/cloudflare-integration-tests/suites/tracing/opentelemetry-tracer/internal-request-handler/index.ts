import { trace } from '@opentelemetry/api';
import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

// Mirrors how the SvelteKit SDK wraps a request on Cloudflare: the `init`-backed wrapper from the
// main entry point, with the OpenTelemetry tracer provider enabled so Kit tracing spans (emitted via
// `startActiveSpan`) end up in the request transaction.
export default {
  async fetch(request, env, ctx) {
    return Sentry._INTERNAL_wrapRequestHandler(
      {
        options: {
          dsn: env.SENTRY_DSN,
          traceLifecycle: 'static',
          tracesSampleRate: 1,
          enableOpenTelemetrySetup: true,
        },
        request,
        context: ctx,
      },
      async () => {
        const tracer = trace.getTracer('sveltekit');

        await tracer.startActiveSpan('sveltekit.handle.root', async handleSpan => {
          await Sentry.startSpan({ name: 'sentry child' }, async () => {
            const resolveSpan = tracer.startSpan('sveltekit.resolve', { attributes: { 'http.route': '/' } });
            resolveSpan.end();
          });

          handleSpan.end();
        });

        return new Response('ok');
      },
    );
  },
} satisfies ExportedHandler<Env>;
