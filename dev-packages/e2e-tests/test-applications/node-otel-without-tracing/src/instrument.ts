const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { NodeTracerProvider, BatchSpanProcessor } = require('@opentelemetry/sdk-trace-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const Sentry = require('@sentry/node');
const { SentryPropagator } = require('@sentry/opentelemetry');
const { UndiciInstrumentation } = require('@opentelemetry/instrumentation-undici');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn:
    process.env.E2E_TEST_DSN ||
    'https://3b6c388182fb435097f41d181be2b2ba@o4504321058471936.ingest.sentry.io/4504321066008576',
  includeLocalVariables: true,
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`, // proxy server
  // Tracing is completely disabled
  // Custom OTEL setup
  skipOpenTelemetrySetup: true,
  enableLogs: true,
});

// Create and configure NodeTracerProvider
const provider = new NodeTracerProvider({
  spanProcessors: [
    new BatchSpanProcessor(
      new OTLPTraceExporter({
        url: 'http://localhost:3032/',
      }),
    ),
  ],
});

// Initialize the provider
provider.register({
  propagator: new SentryPropagator(),
  contextManager: new Sentry.SentryContextManager(),
});

registerInstrumentations({
  instrumentations: [new UndiciInstrumentation(), new HttpInstrumentation()],
});
