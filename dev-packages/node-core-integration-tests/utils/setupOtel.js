const { trace, propagation, context } = require('@opentelemetry/api');
const { BasicTracerProvider } = require('@opentelemetry/sdk-trace-base');
const Sentry = require('@sentry/node-core');
const { SentryPropagator, SentrySampler, SentrySpanProcessor } = require('@sentry/opentelemetry');

exports.setupOtel = function setupOtel(client) {
  const provider = new BasicTracerProvider({
    sampler: client ? new SentrySampler(client) : undefined,
    spanProcessors: [new SentrySpanProcessor()],
  });

  trace.setGlobalTracerProvider(provider);
  propagation.setGlobalPropagator(new SentryPropagator());
  context.setGlobalContextManager(new Sentry.SentryContextManager());

  Sentry.validateOpenTelemetrySetup();
};
