import { DEBUG_BUILD } from '../debug-build';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT,
  SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE,
} from '../semanticAttributes';
import type { MeasurementUnit, Measurements, TimedEvent } from '../types-hoist';
import { logger } from '../utils-hoist/logger';
import { getActiveSpan, getRootSpan } from '../utils/spanUtils';

/**
 * Adds a measurement to the active transaction on the current global scope. You can optionally pass in a different span
 * as the 4th parameter.
 */
export function setMeasurement(name: string, value: number, unit: MeasurementUnit, activeSpan = getActiveSpan()): void {
  const rootSpan = activeSpan && getRootSpan(activeSpan);

  if (rootSpan) {
    DEBUG_BUILD && logger.log(`[Measurement] Setting measurement on root span: ${name} = ${value} ${unit}`);
    rootSpan.addEvent(name, {
      [SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE]: value,
      [SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT]: unit as string,
    });
  }
}

/**
 * Convert timed events to measurements.
 */
export function timedEventsToMeasurements(events: TimedEvent[]): Measurements | undefined {
  if (!events || events.length === 0) {
    return undefined;
  }

  const measurements: Measurements = {};
  events.forEach(event => {
    const attributes = event.attributes || {};
    const unit = attributes[SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT] as MeasurementUnit | undefined;
    const value = attributes[SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE] as number | undefined;

    if (typeof unit === 'string' && typeof value === 'number') {
      measurements[event.name] = { value, unit };
    }
  });

  return measurements;
}
