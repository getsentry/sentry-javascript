import { SpanKind, trace } from '@opentelemetry/api';
import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    traceLifecycle: 'static',
    // Deliberately left unset — the global tracer provider stays OTel's noop, so the spans below
    // must not reach Sentry.
  }),
  {
    async fetch() {
      const tracer = trace.getTracer('integration-test-tracer');

      const inactive = tracer.startSpan('otel inactive', { attributes: { 'test.attribute': 'inactive' } });
      inactive.end();

      await tracer.startActiveSpan(
        'otel parent',
        { kind: SpanKind.CLIENT, attributes: { 'test.attribute': 'parent' } },
        async otelParent => {
          await Sentry.startSpan({ name: 'sentry child' }, async () => {
            const otelGrandchild = tracer.startSpan('otel grandchild', {
              attributes: { 'test.attribute': 'grandchild' },
            });
            otelGrandchild.end();
          });

          otelParent.end();
        },
      );

      return new Response('ok');
    },
  } satisfies ExportedHandler<Env>,
);
