import { objectToBaggageHeader, parseBaggageHeader, SENTRY_BAGGAGE_KEY_PREFIX } from '@sentry/core';

/**
 * To check if a baggage header contains any Sentry baggage values.
 *
 * @param baggageHeader The baggage header to check
 * @returns true if the baggage header contains any keys with the 'sentry-' prefix
 */
export function hasSentryBaggageValues(baggageHeader: string | string[] | undefined): boolean {
  if (!baggageHeader) {
    return false;
  }

  const baggageString = Array.isArray(baggageHeader) ? baggageHeader.join(',') : baggageHeader;

  return baggageString.split(',').some(entry => entry.trim().startsWith(SENTRY_BAGGAGE_KEY_PREFIX));
}

/**
 * Merge two baggage headers into one, where the existing one takes precedence.
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

  // Existing entries take precedence, ensuring order remains stable for minimal changes
  const mergedBaggageEntries = { ...existingBaggageEntries };
  Object.entries(newBaggageEntries).forEach(([key, value]) => {
    if (!mergedBaggageEntries[key]) {
      mergedBaggageEntries[key] = value;
    }
  });

  return objectToBaggageHeader(mergedBaggageEntries);
}
