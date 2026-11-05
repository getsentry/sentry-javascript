import { defineInstrumentation } from 'eve/instrumentation';
import { otelIntegration } from 'eve/instrumentation/otel';

// The documented way to record inputs: with `audience: 'public'` on the channel, a destination makes eve stop
// setting `recordInputs`/`recordOutputs: false`. It has no exporter, Sentry still reads `ai`'s channel.
export default process.env.USE_CONTENT_RECORDING === '1' ? otelIntegration({}) : defineInstrumentation({ events: {} });
