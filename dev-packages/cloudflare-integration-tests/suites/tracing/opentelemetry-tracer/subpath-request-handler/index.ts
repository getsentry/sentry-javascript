import { trace } from '@opentelemetry/api';
import type { CloudflareOptions } from '@sentry/cloudflare';
import { wrapRequestHandler } from '@sentry/cloudflare/request';

interface Env {
  SENTRY_DSN: string;
}

// The `/request` subpath has to work without `nodejs_compat`, so it never registers the
// OpenTelemetry tracer provider, even when `enableOpenTelemetrySetup` is passed. The option is
// omitted from the subpath's type on purpose; it is smuggled in here to pin that contract.
export default {
  async fetch(request, env, ctx) {
    const options: CloudflareOptions = {
      dsn: env.SENTRY_DSN,
      traceLifecycle: 'static',
      tracesSampleRate: 1,
      enableOpenTelemetrySetup: true,
    };

    return wrapRequestHandler({ options, request, context: ctx }, async () => {
      const tracer = trace.getTracer('sveltekit');

      await tracer.startActiveSpan('sveltekit.handle.root', async handleSpan => {
        handleSpan.end();
      });

      return new Response('ok');
    });
  },
} satisfies ExportedHandler<Env>;
