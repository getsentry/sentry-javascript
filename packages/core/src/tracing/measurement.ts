import type { MeasurementUnit } from '@sentry/types';

import { getActiveTransaction } from './utils';

/**
 * Adds a measurement to the current active transaction.
 */
export function setMeasurement(name: string, value: number, unit: MeasurementUnit): void {
  // eslint-disable-next-line deprecation/deprecation
  const transaction = getActiveTransaction();
  if (transaction) {
    // eslint-disable-next-line deprecation/deprecation
    transaction.setMeasurement(name, value, unit);
  }
}
