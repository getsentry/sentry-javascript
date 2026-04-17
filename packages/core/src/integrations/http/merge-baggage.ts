import { objectToBaggageHeader, parseBaggageHeader } from '../../utils/baggage';

// TODO: should this be in utils/baggage?

/**
 * Merge two baggage header values, preserving non-Sentry entries from the
 * existing header and overwriting Sentry entries with new ones.
 */
export function mergeBaggage(existing: string | string[] | number | undefined, incoming: string): string | undefined {
  if (!existing) return incoming;

  const existingEntries = parseBaggageHeader(existing) ?? {};
  const incomingEntries = parseBaggageHeader(incoming) ?? {};

  // Start with non-sentry entries from existing (sentry-* entries will be replaced by incoming)
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(existingEntries)) {
    if (!key.startsWith('sentry-')) {
      merged[key] = value;
    }
  }
  // Add all incoming entries (the new Sentry DSC)
  for (const [key, value] of Object.entries(incomingEntries)) {
    merged[key] = value;
  }

  return objectToBaggageHeader(merged);
}
