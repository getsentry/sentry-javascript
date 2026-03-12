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
 * Merge two baggage headers into one.
 * - Sentry-specific entries (keys starting with "sentry-") from the new baggage take precedence
 * - Non-Sentry entries from existing baggage take precedence
 * The order of the existing baggage will be preserved, and new entries will be added to the end.
 *
 * This matches the behavior of OTEL's propagation.inject() which uses baggage.setEntry()
 * to overwrite existing entries with the same key.
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

  // Start with existing entries, but Sentry entries from new baggage will overwrite
  const mergedBaggageEntries = { ...existingBaggageEntries };
  Object.entries(newBaggageEntries).forEach(([key, value]) => {
    // Sentry-specific keys always take precedence from new baggage
    // Non-Sentry keys only added if not already present
    if (key.startsWith('sentry-') || !mergedBaggageEntries[key]) {
      mergedBaggageEntries[key] = value;
    }
  });

  return objectToBaggageHeader(mergedBaggageEntries);
}
