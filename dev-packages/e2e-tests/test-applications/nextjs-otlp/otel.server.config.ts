import { metrics } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OTLP_RECEIVER_PORT, startOtlpReceiver } from './otel-receiver';

// Next.js can run `register()` more than once in dev, which would leave a second receiver fighting
// for the port and a second set of providers losing the race to register globally.
const globalWithOtelFlag = globalThis as typeof globalThis & { __otelRegistered?: boolean };

if (!globalWithOtelFlag.__otelRegistered) {
  globalWithOtelFlag.__otelRegistered = true;

  startOtlpReceiver();

  const resource = resourceFromAttributes({ 'service.name': 'nextjs-otlp' });
  const otlpBaseUrl = `http://localhost:${OTLP_RECEIVER_PORT}`;

  // The user owns tracing: this registers the global tracer provider, context manager and
  // propagator. Sentry is initialized afterwards with `enableOpenTelemetrySetup: false` so it does
  // not contend for any of them.
  new NodeTracerProvider({
    resource,
    spanProcessors: [
      new BatchSpanProcessor(new OTLPTraceExporter({ url: `${otlpBaseUrl}/v1/traces` }), {
        scheduledDelayMillis: 100,
      }),
    ],
  }).register();

  metrics.setGlobalMeterProvider(
    new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({ url: `${otlpBaseUrl}/v1/metrics` }),
          exportIntervalMillis: 500,
          exportTimeoutMillis: 500,
        }),
      ],
    }),
  );
}
