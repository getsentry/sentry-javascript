import type { SpanExporter } from '@opentelemetry/sdk-trace-base';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

export function registerTracerProvider(exporter: SpanExporter): void {
  new NodeTracerProvider({
    spanProcessors: [new BatchSpanProcessor(exporter, { scheduledDelayMillis: 100 })],
  }).register();
}
