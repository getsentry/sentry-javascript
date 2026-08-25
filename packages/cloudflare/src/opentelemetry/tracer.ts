import { trace } from '@opentelemetry/api';
import { SentryTracerProvider } from '@sentry/opentelemetry';

/**
 * Set up a mock OTEL tracer to allow inter-op with OpenTelemetry emitted spans.
 * This is not perfect but handles easy/common use cases.
 */
export function setupOpenTelemetryTracer(): void {
  trace.setGlobalTracerProvider(new SentryTracerProvider());
}
