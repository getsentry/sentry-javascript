import type { InstrumentationOption } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

/**
 * This method takes an OpenTelemetry instrumentation or
 * array of instrumentations and registers them with OpenTelemetry.
 */
export function addOpenTelemetryInstrumentation(...instrumentations: InstrumentationOption[]): void {
  registerInstrumentations({
    instrumentations,
  });
}
