import type { MeasurementUnit, Span, Transaction } from '@sentry/types';
import { getActiveSpan, getRootSpan } from '../utils/spanUtils';

/**
 * Adds a measurement to the current active transaction.
 */
export function setMeasurement(name: string, value: number, unit: MeasurementUnit): void {
  const activeSpan = getActiveSpan();
  const rootSpan = activeSpan && getRootSpan(activeSpan);

  if (rootSpan && rootSpanIsTransaction(rootSpan)) {
    // eslint-disable-next-line deprecation/deprecation
    rootSpan.setMeasurement(name, value, unit);
  }
}

function rootSpanIsTransaction(rootSpan: Span): rootSpan is Transaction {
  // eslint-disable-next-line deprecation/deprecation
  return typeof (rootSpan as Transaction).setMeasurement === 'function';
}
