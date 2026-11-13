import type { Resource } from '@opentelemetry/resources';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

export function registerTracerProvider(exporter: SpanExporter, resource: Resource): void {
  new NodeTracerProvider({
    resource,
    spanProcessors: [new BatchSpanProcessor(exporter, { scheduledDelayMillis: 100 })],
  }).register();
}
