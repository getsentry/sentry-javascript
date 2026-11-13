import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { getOtlpTracesEndpoint } from '@sentry/nextjs';
import { OTLP_RECEIVER_PORT, startOtlpReceiver } from './otel-receiver';
import { registerTracerProvider } from './otel-tracer-provider';

// Next.js can run `register()` more than once in dev, which would leave a second receiver fighting
// for the port and a second set of providers losing the race to register globally.
const globalWithOtelFlag = globalThis as typeof globalThis & { __otelRegistered?: boolean };

if (!globalWithOtelFlag.__otelRegistered) {
  globalWithOtelFlag.__otelRegistered = true;

  startOtlpReceiver();

  const resource = resourceFromAttributes({ 'service.name': 'nextjs-otlp' });
  const otlpBaseUrl = `http://localhost:${OTLP_RECEIVER_PORT}`;

  // In production the exporter would point at `otlpTracesEndpoint.url`; here it points at the local
  // receiver so the test can assert what was exported. The auth headers are the real DSN-derived ones.
  const otlpTracesEndpoint = getOtlpTracesEndpoint(process.env.NEXT_PUBLIC_E2E_TEST_DSN as string);
  if (!otlpTracesEndpoint) {
    throw new Error('Could not derive an OTLP traces endpoint from NEXT_PUBLIC_E2E_TEST_DSN');
  }

  // The app owns tracing: this registers the global tracer provider, context manager and
  // propagator. Sentry is initialized afterwards with `enableOpenTelemetrySetup: false` so it does
  // not contend for any of them.
  registerTracerProvider(
    new OTLPTraceExporter({ url: `${otlpBaseUrl}/v1/traces`, headers: otlpTracesEndpoint.headers }),
    resource,
  );
}
