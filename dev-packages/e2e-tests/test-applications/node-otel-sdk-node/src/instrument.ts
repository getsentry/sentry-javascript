import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import * as Sentry from '@sentry/node';

// The user owns OpenTelemetry here: their own SDK, their own instrumentation and their own
// exporter. Sentry runs alongside it and must neither register a competing tracer provider nor
// route its own spans through this pipeline.
const sdk = new NodeSDK({
  instrumentations: [new HttpInstrumentation()],
  spanProcessors: [
    new BatchSpanProcessor(new OTLPTraceExporter({ url: 'http://localhost:3032/' }), { scheduledDelayMillis: 100 }),
  ],
});

sdk.start();

Sentry.init({
  traceLifecycle: 'static',
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
});
