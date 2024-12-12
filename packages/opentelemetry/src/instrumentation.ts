import type { Instrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

/**
 * This method takes an OpenTelemetry instrumentation or
 * array of instrumentations and registers them with OpenTelemetry.
 *
 * @deprecated This method will be removed in the next major version of the SDK.
 * Use the `openTelemetryInstrumentations` option in `Sentry.init()` or your custom Sentry Client instead.
 */
export function addOpenTelemetryInstrumentation(...instrumentations: Instrumentation[]): void {
  registerInstrumentations({
    instrumentations,
  });
}
