const { BasicTracerProvider } = require('@opentelemetry/sdk-trace-base');
const Sentry = require('@sentry/node-core');
const { SentryPropagator, SentrySampler, SentrySpanProcessor } = require('@sentry/opentelemetry');

exports.setupOtel = function setupOtel(client) {
  const provider = new BasicTracerProvider({
    sampler: client ? new SentrySampler(client) : undefined,
    spanProcessors: [new SentrySpanProcessor()],
  });

  provider.register({
    propagator: new SentryPropagator(),
    contextManager: new Sentry.SentryContextManager(),
  });

  Sentry.validateOpenTelemetrySetup();
};
