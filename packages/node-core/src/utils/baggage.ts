import { objectToBaggageHeader, parseBaggageHeader, SENTRY_BAGGAGE_KEY_PREFIX } from '@sentry/core';

/**
 * Merge two baggage headers into one.
 * The order of the existing baggage will be preserved, and new entries will be added to the end.
 */
export function mergeBaggageHeaders<Existing extends string | string[] | number | undefined>(
  existing: Existing,
  baggage: string,
): string | undefined | Existing {
  if (!existing) {
    return baggage;
  }

  const existingBaggageEntries = parseBaggageHeader(existing);
  const newBaggageEntries = parseBaggageHeader(baggage);

  if (!newBaggageEntries) {
    return existing;
  }

  const mergedBaggageEntries = { ...existingBaggageEntries };
  Object.entries(newBaggageEntries).forEach(([key, value]) => {
    if (key.startsWith(SENTRY_BAGGAGE_KEY_PREFIX) || !mergedBaggageEntries[key]) {
      mergedBaggageEntries[key] = value;
    }
  });

  return objectToBaggageHeader(mergedBaggageEntries);
}
