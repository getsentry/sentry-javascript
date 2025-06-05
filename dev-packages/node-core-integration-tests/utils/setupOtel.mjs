import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import * as Sentry from '@sentry/node-core';
import { SentryPropagator, SentrySampler, SentrySpanProcessor } from '@sentry/opentelemetry';

export function setupOtel(client) {
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
