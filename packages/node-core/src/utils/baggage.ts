import { objectToBaggageHeader, parseBaggageHeader, SENTRY_BAGGAGE_KEY_PREFIX } from '@sentry/core';

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

  const newSentryBaggageEntries = Object.entries(newBaggageEntries).filter(([key]) =>
    key.startsWith(SENTRY_BAGGAGE_KEY_PREFIX),
  );

  const oldBaggageEntriesWithoutSentry = existingBaggageEntries
    ? Object.entries(existingBaggageEntries).filter(([key]) => !key.startsWith(SENTRY_BAGGAGE_KEY_PREFIX))
    : [];

  // If new baggage contains at least one sentry- value, we remove all old sentry- values
  // otherwise, we keep old sentry- values. If we don't remove old sentry- values, we end
  // up with an inconsistent dynamic sampling context propagation.
  const mergedBaggageEntries = newSentryBaggageEntries.length
    ? Object.fromEntries(oldBaggageEntriesWithoutSentry)
    : existingBaggageEntries
      ? Object.fromEntries(Object.entries(existingBaggageEntries))
      : {};

  Object.entries(newBaggageEntries).forEach(([key, value]) => {
    // Sentry-specific keys always take precedence from new baggage
    // Non-Sentry keys only added if not already present
    if (key.startsWith(SENTRY_BAGGAGE_KEY_PREFIX) || !mergedBaggageEntries[key]) {
      mergedBaggageEntries[key] = value;
    }
  });

  return objectToBaggageHeader(mergedBaggageEntries);
}
