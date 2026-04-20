import { DEBUG_BUILD } from '../debug-build';
import type { DynamicSamplingContext } from '../types-hoist/envelope';
import { debug } from './debug-logger';
import { isString } from './is';

export const SENTRY_BAGGAGE_KEY_PREFIX = 'sentry-';

export const SENTRY_BAGGAGE_KEY_PREFIX_REGEX = /^sentry-/;

/**
 * Max length of a serialized baggage string
 *
 * https://www.w3.org/TR/baggage/#limits
 */
export const MAX_BAGGAGE_STRING_LENGTH = 8192;

/**
 * Takes a baggage header and turns it into Dynamic Sampling Context, by extracting all the "sentry-" prefixed values
 * from it.
 *
 * @param baggageHeader A very bread definition of a baggage header as it might appear in various frameworks.
 * @returns The Dynamic Sampling Context that was found on `baggageHeader`, if there was any, `undefined` otherwise.
 */
export function baggageHeaderToDynamicSamplingContext(
  // Very liberal definition of what any incoming header might look like
  baggageHeader: string | string[] | number | null | undefined | boolean,
): Partial<DynamicSamplingContext> | undefined {
  const baggageObject = parseBaggageHeader(baggageHeader);

  if (!baggageObject) {
    return undefined;
  }

  // Read all "sentry-" prefixed values out of the baggage object and put it onto a dynamic sampling context object.
  const dynamicSamplingContext = Object.entries(baggageObject).reduce<Record<string, string>>((acc, [key, value]) => {
    if (key.startsWith(SENTRY_BAGGAGE_KEY_PREFIX)) {
      const nonPrefixedKey = key.slice(SENTRY_BAGGAGE_KEY_PREFIX.length);
      acc[nonPrefixedKey] = value;
    }
    return acc;
  }, {});

  // Only return a dynamic sampling context object if there are keys in it.
  // A keyless object means there were no sentry values on the header, which means that there is no DSC.
  if (Object.keys(dynamicSamplingContext).length > 0) {
    return dynamicSamplingContext as Partial<DynamicSamplingContext>;
  } else {
    return undefined;
  }
}

/**
 * Turns a Dynamic Sampling Object into a baggage header by prefixing all the keys on the object with "sentry-".
 *
 * @param dynamicSamplingContext The Dynamic Sampling Context to turn into a header. For convenience and compatibility
 * with the `getDynamicSamplingContext` method on the Transaction class ,this argument can also be `undefined`. If it is
 * `undefined` the function will return `undefined`.
 * @returns a baggage header, created from `dynamicSamplingContext`, or `undefined` either if `dynamicSamplingContext`
 * was `undefined`, or if `dynamicSamplingContext` didn't contain any values.
 */
export function dynamicSamplingContextToSentryBaggageHeader(
  // this also takes undefined for convenience and bundle size in other places
  dynamicSamplingContext?: Partial<DynamicSamplingContext>,
): string | undefined {
  if (!dynamicSamplingContext) {
    return undefined;
  }

  // Prefix all DSC keys with "sentry-" and put them into a new object
  const sentryPrefixedDSC = Object.entries(dynamicSamplingContext).reduce<Record<string, string>>(
    (acc, [dscKey, dscValue]) => {
      if (dscValue) {
        acc[`${SENTRY_BAGGAGE_KEY_PREFIX}${dscKey}`] = dscValue;
      }
      return acc;
    },
    {},
  );

  return objectToBaggageHeader(sentryPrefixedDSC);
}

/**
 * Take a baggage header and parse it into an object.
 */
export function parseBaggageHeader(
  baggageHeader: string | string[] | number | null | undefined | boolean,
): Record<string, string> | undefined {
  if (!baggageHeader || (!isString(baggageHeader) && !Array.isArray(baggageHeader))) {
    return undefined;
  }

  if (Array.isArray(baggageHeader)) {
    // Combine all baggage headers into one object containing the baggage values so we can later read the Sentry-DSC-values from it
    return baggageHeader.reduce<Record<string, string>>((acc, curr) => {
      const currBaggageObject = baggageHeaderToObject(curr);
      Object.entries(currBaggageObject).forEach(([key, value]) => {
        acc[key] = value;
      });
      return acc;
    }, {});
  }

  return baggageHeaderToObject(baggageHeader);
}

/**
 * Will parse a baggage header, which is a simple key-value map, into a flat object.
 *
 * @param baggageHeader The baggage header to parse.
 * @returns a flat object containing all the key-value pairs from `baggageHeader`.
 */
function baggageHeaderToObject(baggageHeader: string): Record<string, string> {
  return baggageHeader
    .split(',')
    .map(baggageEntry => {
      const eqIdx = baggageEntry.indexOf('=');
      if (eqIdx === -1) {
        // Likely an invalid entry
        return [];
      }
      const key = baggageEntry.slice(0, eqIdx);
      const value = baggageEntry.slice(eqIdx + 1);
      return [key, value].map(keyOrValue => {
        try {
          return decodeURIComponent(keyOrValue.trim());
        } catch {
          // We ignore errors here, e.g. if the value cannot be URL decoded.
          // This will then be skipped in the next step
          return;
        }
      });
    })
    .reduce<Record<string, string>>((acc, [key, value]) => {
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    }, {});
}

/**
 * Turns a flat object (key-value pairs) into a baggage header, which is also just key-value pairs.
 *
 * @param object The object to turn into a baggage header.
 * @returns a baggage header string, or `undefined` if the object didn't have any values, since an empty baggage header
 * is not spec compliant.
 */
export function objectToBaggageHeader(object: Record<string, string>): string | undefined {
  if (Object.keys(object).length === 0) {
    // An empty baggage header is not spec compliant: We return undefined.
    return undefined;
  }

  return Object.entries(object).reduce((baggageHeader, [objectKey, objectValue], currentIndex) => {
    const baggageEntry = `${encodeURIComponent(objectKey)}=${encodeURIComponent(objectValue)}`;
    const newBaggageHeader = currentIndex === 0 ? baggageEntry : `${baggageHeader},${baggageEntry}`;
    if (newBaggageHeader.length > MAX_BAGGAGE_STRING_LENGTH) {
      DEBUG_BUILD &&
        debug.warn(
          `Not adding key: ${objectKey} with val: ${objectValue} to baggage header due to exceeding baggage size limits.`,
        );
      return baggageHeader;
    } else {
      return newBaggageHeader;
    }
  }, '');
}

/**
 * Merge two baggage headers into one.
 * - Sentry-specific entries (keys starting with "sentry-") from the new
 *   baggage take precedence
 * - Non-Sentry entries from existing baggage take precedence
 *
 * The order of the existing baggage will be preserved, and new entries will
 * be added to the end.
 *
 * This matches the behavior of OTEL's propagation.inject() which uses
 * `baggage.setEntry()`  to overwrite existing entries with the same key.
 */
export function mergeBaggageHeaders<Existing extends string | string[] | number | undefined>(
  existing: Existing,
  incoming: string,
): string | undefined | Existing {
  if (!existing) {
    return incoming;
  }

  const existingEntries = parseBaggageHeader(existing);
  const incomingEntries = parseBaggageHeader(incoming);

  if (!incomingEntries) {
    return existing;
  }

  // 1. All non-sentry entries from existing are kept
  // 2. All sentry- entries from the new baggage are retained
  // 3. If sentry- entries present in new, ignore from old, else keep from old.
  // 4. Non-sentry entries from new are only kept if not in existing.

  const merged: Record<string, string> = {};

  // partition incoming entries into sentry and non-sentry prefixed
  let hasNewSentryEntries = false;
  const newSentryEntries: Record<string, string> = {};
  const newNonSentryEntries: Record<string, string> = {};
  for (const [key, value] of Object.entries(incomingEntries)) {
    if (key.startsWith(SENTRY_BAGGAGE_KEY_PREFIX)) {
      newSentryEntries[key] = value;
      hasNewSentryEntries = true;
    } else {
      newNonSentryEntries[key] = value;
    }
  }

  // If new baggage contains at least one sentry- value, we remove all old
  // sentry- values otherwise, we keep old sentry- values. If we don't remove
  // old sentry- values, we end up with an inconsistent dynamic sampling
  // context propagation.
  if (existingEntries) {
    for (const [key, value] of Object.entries(existingEntries)) {
      if (!hasNewSentryEntries || !key.startsWith(SENTRY_BAGGAGE_KEY_PREFIX)) {
        merged[key] = value;
      }
    }
  }

  // Assign new sentry fields.
  if (hasNewSentryEntries) {
    Object.assign(merged, newSentryEntries);
  }

  // assign new non-sentry fields not found on existing object.
  for (const [key, value] of Object.entries(newNonSentryEntries)) {
    merged[key] ??= value;
  }

  return objectToBaggageHeader(merged);
}
