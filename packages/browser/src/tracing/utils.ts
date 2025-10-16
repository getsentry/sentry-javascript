import { WINDOW } from '../helpers';

/**
 * Checks if the baggage header has Sentry values.
 */
export function baggageHeaderHasSentryValues(baggageHeader: string): boolean {
  return baggageHeader.split(',').some(value => value.trim().startsWith('sentry-'));
}

/**
 * Gets the full URL from a given URL string.
 */
export function getFullURL(url: string): string | undefined {
  try {
    // By adding a base URL to new URL(), this will also work for relative urls
    // If `url` is a full URL, the base URL is ignored anyhow
    const parsed = new URL(url, WINDOW.location.origin);
    return parsed.href;
  } catch {
    return undefined;
  }
}

/**
 * Checks if the entry is a PerformanceResourceTiming.
 */
export function isPerformanceResourceTiming(entry: PerformanceEntry): entry is PerformanceResourceTiming {
  return (
    entry.entryType === 'resource' &&
    'initiatorType' in entry &&
    typeof (entry as PerformanceResourceTiming).nextHopProtocol === 'string' &&
    (entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest')
  );
}

/**
 * Creates a Headers object from a record of string key-value pairs, and returns undefined if it fails.
 */
export function createHeadersSafely(headers: Record<string, string> | undefined): Headers | undefined {
  try {
    return new Headers(headers);
  } catch {
    // noop
    return undefined;
  }
}
