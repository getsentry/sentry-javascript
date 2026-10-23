import { E2E_TEST_DSN } from '$env/static/private';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import * as Sentry from '@sentry/sveltekit';
import { OTLP_RECEIVER_PORT, startOtlpReceiver } from './otel-receiver';
import { registerTracerProvider } from './otel-tracer-provider';

startOtlpReceiver();

const resource = resourceFromAttributes({ 'service.name': 'sveltekit-2-otlp' });
const otlpBaseUrl = `http://localhost:${OTLP_RECEIVER_PORT}`;

// In production the exporter would point at `otlpTracesEndpoint.url`; here it points at the local
// receiver so the test can assert what was exported. The auth headers are the real DSN-derived ones.
const otlpTracesEndpoint = Sentry.getOtlpTracesEndpoint(E2E_TEST_DSN);
if (!otlpTracesEndpoint) {
  throw new Error('Could not derive an OTLP traces endpoint from E2E_TEST_DSN');
}

// The app owns tracing: this registers the global tracer provider, context manager and
// propagator. Sentry is initialized afterwards with `enableOpenTelemetrySetup: false` so it does
// not contend for any of them.
registerTracerProvider(
  new OTLPTraceExporter({ url: `${otlpBaseUrl}/v1/traces`, headers: otlpTracesEndpoint.headers }),
  resource,
);

Sentry.init({
  environment: 'qa',
  dsn: E2E_TEST_DSN,
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`, // proxy server

  // Errors only: no `tracesSampleRate`, so Sentry starts no spans and sends no transactions.

  // The app brings its own OpenTelemetry SDK, which already owns the global tracer provider,
  // context manager and propagator.
  enableOpenTelemetrySetup: false,

  // Puts the active OpenTelemetry span's trace on everything Sentry sends.
  integrations: [Sentry.openTelemetryIntegration()],
});
