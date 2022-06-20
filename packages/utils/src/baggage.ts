import { Baggage, BaggageObj, TraceparentData } from '@sentry/types';
import { HttpHeaderValue } from '@sentry/types/build/types/misc';

import { isString } from './is';
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
export function createBaggage(initItems: BaggageObj, baggageString: string = '', mutable: boolean = true): Baggage {
  return [{ ...initItems }, baggageString, mutable];
}

/** Get a value from baggage */
export function getBaggageValue(baggage: Baggage, key: keyof BaggageObj): BaggageObj[keyof BaggageObj] {
  return baggage[0][key];
}

/** Add a value to baggage */
export function setBaggageValue(baggage: Baggage, key: keyof BaggageObj, value: BaggageObj[keyof BaggageObj]): void {
  if (isBaggageMutable(baggage)) {
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
 * Checks if baggage is mutable
 * @param baggage
 * @returns true if baggage is mutable, else false
 */
export function isBaggageMutable(baggage: Baggage): boolean {
  return baggage[2];
}

/**
 * Sets the passed baggage immutable
 * @param baggage
 */
export function setBaggageImmutable(baggage: Baggage): void {
  baggage[2] = false;
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

/** Parse a baggage header from a string or a string array and return a Baggage object */
export function parseBaggageHeader(inputBaggageValue: HttpHeaderValue): Baggage {
  // Adding this check here because we got reports of this function failing due to the input value
  // not being a string. This debug log might help us determine what's going on here.
  if ((!Array.isArray(inputBaggageValue) && !isString(inputBaggageValue)) || typeof inputBaggageValue === 'number') {
    __DEBUG_BUILD__ &&
      logger.warn(
        '[parseBaggageHeader] Received input value of incompatible type: ',
        typeof inputBaggageValue,
        inputBaggageValue,
      );

    // Gonna early-return an empty baggage object so that we don't fail later on
    return createBaggage({}, '');
  }

  const baggageEntries = (isString(inputBaggageValue) ? inputBaggageValue : inputBaggageValue.join(','))
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry !== '');

  return baggageEntries.reduce(
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
          true,
        ];
      } else {
        return [baggageObj, baggageString === '' ? curr : `${baggageString},${curr}`, true];
      }
    },
    [{}, '', true],
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
 * @param thirdPartyBaggageHeader possibly existing baggage header string or string[] added from a third
 *        party to the request headers
 *
 * @return a merged and serialized baggage string to be propagated with the outgoing request
 */
export function mergeAndSerializeBaggage(incomingBaggage?: Baggage, thirdPartyBaggageHeader?: HttpHeaderValue): string {
  if (!incomingBaggage && !thirdPartyBaggageHeader) {
    return '';
  }

  const headerBaggage = (thirdPartyBaggageHeader && parseBaggageHeader(thirdPartyBaggageHeader)) || undefined;
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
 * In a second step, this functions determines if the created Baggage object should be set immutable
 * to prevent mutation of the Sentry data.
 *
 * Extracted this logic to a function because it's duplicated in a lot of places.
 *
 * @param rawBaggageValue
 * @param sentryTraceHeader
 */
export function parseBaggageSetMutability(
  rawBaggageValue: HttpHeaderValue | false | undefined,
  sentryTraceHeader: TraceparentData | string | false | undefined | null,
): Baggage {
  const baggage = parseBaggageHeader(rawBaggageValue || '');
  if (!isSentryBaggageEmpty(baggage) || (sentryTraceHeader && isSentryBaggageEmpty(baggage))) {
    setBaggageImmutable(baggage);
  }
  return baggage;
}
