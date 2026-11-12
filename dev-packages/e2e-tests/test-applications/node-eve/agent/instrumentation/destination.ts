import { defineInstrumentation } from 'eve/instrumentation';
import { otelIntegration } from 'eve/instrumentation/otel';

// eve < 1.0.0-rc.10 only stops setting `recordInputs`/`recordOutputs: false` when a destination exists. This one
// exports nothing, Sentry still reads `ai`'s channel. eve doesn't document this empty form, so it may change.
export default process.env.USE_CONTENT_RECORDING === '1' ? otelIntegration({}) : defineInstrumentation({ events: {} });
