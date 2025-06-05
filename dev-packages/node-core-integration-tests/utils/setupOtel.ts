import { context, propagation, trace } from '@opentelemetry/api';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import type { NodeClient } from '@sentry/node-core';
import * as Sentry from '@sentry/node-core';
import { SentryPropagator, SentrySampler, SentrySpanProcessor } from '@sentry/opentelemetry';

export function setupOtel(client: NodeClient | undefined): BasicTracerProvider {
  const provider = new BasicTracerProvider({
    sampler: client ? new SentrySampler(client) : undefined,
    spanProcessors: [new SentrySpanProcessor()],
  });

  provider.register({
    propagator: new SentryPropagator(),
    contextManager: new Sentry.SentryContextManager(),
  });

  Sentry.validateOpenTelemetrySetup();

  return provider;
}

export function cleanupOtel(provider: BasicTracerProvider): void {
  void provider.forceFlush().catch(() => {
    // no-op
  });
  void provider.shutdown().catch(() => {
    // no-op
  });

  // Disable all globally registered APIs
  trace.disable();
  context.disable();
  propagation.disable();
}
