import { context, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';
import type { Resource } from '@opentelemetry/resources';
import type { SpanExporter } from '@opentelemetry/sdk-trace';
import { BatchSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';

// OpenTelemetry SDK v3 has no `NodeTracerProvider.register()`, so the app registers the tracer
// provider, context manager and propagator itself. The OTel SDK v2 variant replaces this file with
// `otel-v2/otel-tracer-provider.ts`.
export function registerTracerProvider(exporter: SpanExporter, resource: Resource): void {
  trace.setGlobalTracerProvider(
    new TracerProvider({
      resource,
      spanProcessors: [new BatchSpanProcessor({ exporter, scheduledDelayMillis: 100 })],
    }),
  );
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(
    new CompositePropagator({ propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()] }),
  );
}
