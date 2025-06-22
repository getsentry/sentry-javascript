import { context, propagation, trace } from '@opentelemetry/api';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import type { Client } from '@sentry/core';
import * as Sentry from '@sentry/node-core';
import { SentryPropagator, SentrySampler, SentrySpanProcessor } from '@sentry/opentelemetry';

export function setupOtel(client: Client | undefined): BasicTracerProvider | undefined {
  if (!client) {
    return undefined;
  }

  const provider = new BasicTracerProvider({
    sampler: new SentrySampler(client),
    spanProcessors: [new SentrySpanProcessor()],
  });

  trace.setGlobalTracerProvider(provider);
  propagation.setGlobalPropagator(new SentryPropagator());
  context.setGlobalContextManager(new Sentry.SentryContextManager());

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
