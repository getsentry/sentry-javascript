import { defineInstrumentation } from 'eve/instrumentation';
import { otel } from 'eve/instrumentation/otel';

// On recent eve an explicit policy also lifts the audience limit, so this applies to every session. eve 0.63 keeps
// the limit, which is why the recording variants pin a newer eve.
export default process.env.USE_CONTENT_RECORDING === '1'
  ? otel({ tracePolicy: () => ({ emit: true, recordInputs: true, recordOutputs: true }) })
  : defineInstrumentation({ events: {} });
