import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import * as Sentry from '@sentry/node';
import { SentryPropagator, SentrySpanProcessor } from '@sentry/opentelemetry';
import { CustomSampler } from './custom-sampler';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn:
    process.env.E2E_TEST_DSN ||
    'https://3b6c388182fb435097f41d181be2b2ba@o4504321058471936.ingest.sentry.io/4504321066008576',
  includeLocalVariables: true,
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`, // proxy server
  skipOpenTelemetrySetup: true,
  // By defining _any_ sample rate, tracing integrations will be added by default
  tracesSampleRate: 0,
});

const provider = new NodeTracerProvider({
  sampler: new CustomSampler(),
});

provider.addSpanProcessor(new SentrySpanProcessor());

provider.register({
  propagator: new SentryPropagator(),
  contextManager: new Sentry.SentryContextManager(),
});

Sentry.validateOpenTelemetrySetup();
