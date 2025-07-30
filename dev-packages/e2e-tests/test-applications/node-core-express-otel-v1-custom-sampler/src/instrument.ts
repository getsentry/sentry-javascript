import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import * as Sentry from '@sentry/node-core';
import { SentryPropagator, SentrySpanProcessor } from '@sentry/opentelemetry';
import { CustomSampler } from './custom-sampler';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  includeLocalVariables: true,
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
  openTelemetryInstrumentations: [new HttpInstrumentation()],
});

const provider = new NodeTracerProvider({
  sampler: new CustomSampler(),
  spanProcessors: [new SentrySpanProcessor()],
});

provider.register({
  propagator: new SentryPropagator(),
  contextManager: new Sentry.SentryContextManager(),
});

Sentry.validateOpenTelemetrySetup();
