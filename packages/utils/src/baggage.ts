import { Baggage, BaggageObj, TraceparentData } from '@sentry/types';

import { logger } from './logger';

export const BAGGAGE_HEADER_NAME = 'baggage';

export const SENTRY_BAGGAGE_KEY_PREFIX = 'sentry-';

export const SENTRY_BAGGAGE_KEY_PREFIX_REGEX = /^sentry-/;

/**
 * Max length of a serialized baggage string
 *
 * https://www.w3.org/TR/baggage/#limits
 */
export const MAX_BAGGAGE_STRING_LENGTH = 8192;

/** Create an instance of Baggage */
export function createBaggage(initItems: BaggageObj, baggageString: string = '', frozen: boolean = false): Baggage {
  return [{ ...initItems }, baggageString, frozen];
}

/** Get a value from baggage */
export function getBaggageValue(baggage: Baggage, key: keyof BaggageObj): BaggageObj[keyof BaggageObj] {
  return baggage[0][key];
}

/** Add a value to baggage */
export function setBaggageValue(baggage: Baggage, key: keyof BaggageObj, value: BaggageObj[keyof BaggageObj]): void {
  if (!isBaggageFrozen(baggage)) {
    baggage[0][key] = value;
  }
}

/** Check if the Sentry part of the passed baggage (i.e. the first element in the tuple) is empty */
export function isSentryBaggageEmpty(baggage: Baggage): boolean {
  return Object.keys(baggage[0]).length === 0;
}

/** Check if the Sentry part of the passed baggage (i.e. the first element in the tuple) is empty */
export function isBaggageEmpty(baggage: Baggage): boolean {
  const thirdPartyBaggage = getThirdPartyBaggage(baggage);
  return isSentryBaggageEmpty(baggage) && (thirdPartyBaggage == undefined || thirdPartyBaggage.length === 0);
}

/** Returns Sentry specific baggage values */
export function getSentryBaggageItems(baggage: Baggage): BaggageObj {
  return baggage[0];
}

/**
 * Returns 3rd party baggage string of @param baggage
 * @param baggage
 */
export function getThirdPartyBaggage(baggage: Baggage): string {
  return baggage[1];
}

/**
 * Checks if baggage is frozen (i.e. immutable)
 * @param baggage
 * @returns true if baggage is frozen, else false
 */
export function isBaggageFrozen(baggage: Baggage): boolean {
  return baggage[2];
}

/**
 * Freezes baggage (i.e. makes it immutable)
 * @param baggage
 */
export function freezeBaggage(baggage: Baggage): void {
  baggage[2] = true;
}

/** Serialize a baggage object */
export function serializeBaggage(baggage: Baggage): string {
  return Object.keys(baggage[0]).reduce((prev, key: keyof BaggageObj) => {
    const val = baggage[0][key] as string;
    const baggageEntry = `${SENTRY_BAGGAGE_KEY_PREFIX}${encodeURIComponent(key)}=${encodeURIComponent(val)}`;
    const newVal = prev === '' ? baggageEntry : `${prev},${baggageEntry}`;
    if (newVal.length > MAX_BAGGAGE_STRING_LENGTH) {
      __DEBUG_BUILD__ &&
        logger.warn(`Not adding key: ${key} with val: ${val} to baggage due to exceeding baggage size limits.`);
      return prev;
    } else {
      return newVal;
    }
  }, baggage[1]);
}

/** Parse a baggage header from a string and return a Baggage object */
export function parseBaggageString(inputBaggageString: string): Baggage {
  return inputBaggageString.split(',').reduce(
    ([baggageObj, baggageString], curr) => {
      const [key, val] = curr.split('=');
      if (SENTRY_BAGGAGE_KEY_PREFIX_REGEX.test(key)) {
        const baggageKey = decodeURIComponent(key.split('-')[1]);
        return [
          {
            ...baggageObj,
            [baggageKey]: decodeURIComponent(val),
          },
          baggageString,
          false,
        ];
      } else {
        return [baggageObj, baggageString === '' ? curr : `${baggageString},${curr}`, false];
      }
    },
    [{}, '', false],
  );
}

/**
 * Merges the baggage header we saved from the incoming request (or meta tag) with
 * a possibly created or modified baggage header by a third party that's been added
 * to the outgoing request header.
 *
 * In case @param headerBaggageString exists, we can safely add the the 3rd party part of @param headerBaggage
 * with our @param incomingBaggage. This is possible because if we modified anything beforehand,
 * it would only affect parts of the sentry baggage (@see Baggage interface).
 *
 * @param incomingBaggage the baggage header of the incoming request that might contain sentry entries
 * @param headerBaggageString possibly existing baggage header string added from a third party to request headers
 *
 * @return a merged and serialized baggage string to be propagated with the outgoing request
 */
export function mergeAndSerializeBaggage(incomingBaggage?: Baggage, headerBaggageString?: string): string {
  if (!incomingBaggage && !headerBaggageString) {
    return '';
  }

  const headerBaggage = (headerBaggageString && parseBaggageString(headerBaggageString)) || undefined;
  const thirdPartyHeaderBaggage = headerBaggage && getThirdPartyBaggage(headerBaggage);

  const finalBaggage = createBaggage(
    (incomingBaggage && incomingBaggage[0]) || {},
    thirdPartyHeaderBaggage || (incomingBaggage && incomingBaggage[1]) || '',
  );
  return serializeBaggage(finalBaggage);
}

/**
 * Helper function that takes a raw baggage string (if available) and the processed sentry-trace header
 * data (if available), parses the baggage string and creates a Baggage object
 * If there is no baggage string, it will create an empty Baggage object.
 * In a second step, this functions determines when the created Baggage object should be frozen to prevent mutation
 * of the Sentry data.
 *
 * Extracted this logic to a function because it's duplicated in a lot of places.
 *
 * @param rawBaggageString
 * @param traceparentData
 */
export function parseAndFreezeBaggageIfNecessary(
  rawBaggageString: string | false | undefined | null,
  traceparentData: TraceparentData | string | false | undefined | null,
): Baggage {
  const baggage = parseBaggageString(rawBaggageString || '');
  if (!isSentryBaggageEmpty(baggage) || (traceparentData && isSentryBaggageEmpty(baggage))) {
    freezeBaggage(baggage);
  }
  return baggage;
}
