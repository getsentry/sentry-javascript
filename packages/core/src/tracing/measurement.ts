import type { MeasurementUnit, Measurements, TimedEvent } from '@sentry/types';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT,
  SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE,
} from '../semanticAttributes';
import { getActiveSpan, getRootSpan } from '../utils/spanUtils';

/**
 * Adds a measurement to the current active transaction.
 */
export function setMeasurement(name: string, value: number, unit: MeasurementUnit): void {
  const activeSpan = getActiveSpan();
  const rootSpan = activeSpan && getRootSpan(activeSpan);

  if (rootSpan) {
    rootSpan.addEvent(name, {
      [SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE]: value,
      [SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT]: unit as string,
    });
  }
}

/**
 * Convert timed events to measurements.
 */
export function timedEventsToMeasurements(events: TimedEvent[]): Measurements {
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
