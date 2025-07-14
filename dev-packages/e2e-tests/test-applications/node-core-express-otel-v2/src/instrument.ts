import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import * as Sentry from '@sentry/node-core';
import { SentrySpanProcessor, SentryPropagator, SentrySampler } from '@sentry/opentelemetry';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';

declare global {
  namespace globalThis {
    var transactionIds: string[];
  }
}

const sentryClient = Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  includeLocalVariables: true,
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
  openTelemetryInstrumentations: [new HttpInstrumentation()],
});

const provider = new NodeTracerProvider({
  sampler: sentryClient ? new SentrySampler(sentryClient) : undefined,
  spanProcessors: [new SentrySpanProcessor()],
});

provider.register({
  propagator: new SentryPropagator(),
  contextManager: new Sentry.SentryContextManager(),
});

Sentry.validateOpenTelemetrySetup();

Sentry.addEventProcessor(event => {
  global.transactionIds = global.transactionIds || [];

  if (event.type === 'transaction') {
    const eventId = event.event_id;

    if (eventId) {
      global.transactionIds.push(eventId);
    }
  }

  return event;
});
