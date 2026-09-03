import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import * as Sentry from '@sentry/node';
import { register } from 'node:module';

// What an ESM app needs for the OpenTelemetry instrumentation to see the modules it patches. It
// puts import-in-the-middle in the process next to the module hooks Sentry's channel injection
// registers from `Sentry.init()` below, which is the pairing this app exists to cover.
register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

// OpenTelemetry owns tracing here: the user's own SDK, their own instrumentation and their own
// exporter. In production the exporter would point at `Sentry.getOtlpTracesEndpoint(dsn)`; here it
// points at a local receiver so the test can assert what was exported.
const sdk = new NodeSDK({
  instrumentations: [new HttpInstrumentation()],
  spanProcessors: [
    new BatchSpanProcessor(new OTLPTraceExporter({ url: 'http://localhost:3032/' }), { scheduledDelayMillis: 100 }),
  ],
});

sdk.start();

Sentry.init({
  environment: 'qa',
  dsn: process.env.E2E_TEST_DSN,
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`, // proxy server
  // no tracesSampleRate: OpenTelemetry owns spans, Sentry owns errors and logs
  integrations: [Sentry.openTelemetryIntegration()],
});
