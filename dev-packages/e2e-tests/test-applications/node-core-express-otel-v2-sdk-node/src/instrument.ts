const opentelemetry = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const Sentry = require('@sentry/node-core');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { SentrySpanProcessor, SentryPropagator, SentrySampler } = require('@sentry/opentelemetry');

const sentryClient = Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn:
    process.env.E2E_TEST_DSN ||
    'https://3b6c388182fb435097f41d181be2b2ba@o4504321058471936.ingest.sentry.io/4504321066008576',
  includeLocalVariables: true,
  debug: true,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
});

if (sentryClient) {
  const sdk = new opentelemetry.NodeSDK({
    sampler: new SentrySampler(sentryClient),
    textMapPropagator: new SentryPropagator(),
    contextManager: new Sentry.SentryContextManager(),
    spanProcessors: [
      new SentrySpanProcessor(),
      new opentelemetry.node.BatchSpanProcessor(
        new OTLPTraceExporter({
          url: 'http://localhost:3032/',
        }),
      ),
    ],
    instrumentations: [new HttpInstrumentation()],
  });

  sdk.start();

  Sentry.validateOpenTelemetrySetup();
}
