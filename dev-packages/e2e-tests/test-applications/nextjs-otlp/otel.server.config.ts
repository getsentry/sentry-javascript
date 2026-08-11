import { metrics } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SentryContextManager } from '@sentry/nextjs';
import { SentryPropagator } from '@sentry/opentelemetry';
import { OTLP_RECEIVER_PORT, startOtlpReceiver } from './otel-receiver';

// Next.js can run `register()` more than once in dev, which would leave a second receiver fighting
// for the port and a second set of providers losing the race to register globally.
const globalWithOtelFlag = globalThis as typeof globalThis & { __otelRegistered?: boolean };

if (!globalWithOtelFlag.__otelRegistered) {
  globalWithOtelFlag.__otelRegistered = true;

  startOtlpReceiver();

  const resource = resourceFromAttributes({ 'service.name': 'nextjs-otlp' });
  const otlpBaseUrl = `http://localhost:${OTLP_RECEIVER_PORT}`;

  // The user owns tracing. Sentry's context manager and propagator are handed to the user's
  // provider (the documented `skipOpenTelemetrySetup` path) so Sentry's scopes still ride on the
  // OpenTelemetry context. No `SentrySpanProcessor` or `SentrySampler`: Sentry sends no spans here.
  new NodeTracerProvider({
    resource,
    spanProcessors: [
      new BatchSpanProcessor(new OTLPTraceExporter({ url: `${otlpBaseUrl}/v1/traces` }), {
        scheduledDelayMillis: 100,
      }),
    ],
  }).register({
    contextManager: new SentryContextManager(),
    propagator: new SentryPropagator(),
  });

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
