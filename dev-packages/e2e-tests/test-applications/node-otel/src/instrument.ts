const opentelemetry = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const Sentry = require('@sentry/node');

const sentryClient = Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn:
    process.env.E2E_TEST_DSN ||
    'https://3b6c388182fb435097f41d181be2b2ba@o4504321058471936.ingest.sentry.io/4504321066008576',
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,

  // Additional OTEL options
  openTelemetrySpanProcessors: [
    new opentelemetry.node.BatchSpanProcessor(
      new OTLPTraceExporter({
        url: 'http://localhost:3032/',
      }),
    ),
  ],
});
