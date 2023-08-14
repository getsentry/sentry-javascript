import type { MeasurementUnit } from '@sentry/types';

import { getActiveTransaction } from './utils';

/**
 * Adds a measurement to the current active transaction.
 */
export function setMeasurement(name: string, value: number, unit: MeasurementUnit): void {
  const transaction = getActiveTransaction();
  if (transaction) {
    transaction.setMeasurement(name, value, unit);
  }
}
