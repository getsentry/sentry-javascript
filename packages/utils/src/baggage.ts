export type AllowedBaggageKeys = 'environment' | 'release'; // TODO: Add remaining allowed baggage keys | 'transaction' | 'userid' | 'usersegment';
export type BaggageObj = Partial<Record<AllowedBaggageKeys, string> & Record<string, string>>;
export type Baggage = [BaggageObj, string];

export const BAGGAGE_HEADER_NAME = 'baggage';

export const SENTRY_BAGGAGE_KEY_PREFIX = 'sentry-';

export const SENTRY_BAGGAGE_KEY_PREFIX_REGEX = /^sentry-/;

// baggage = sentry-environment=prod;my-info=true;

/**
 * Max length of a serialized baggage string
 *
 * https://www.w3.org/TR/baggage/#limits
 */
export const MAX_BAGGAGE_STRING_LENGTH = 8192;

/** Create an instance of Baggage */
export function createBaggage(initItems: BaggageObj, baggageString: string = ''): Baggage {
  return [{ ...initItems }, baggageString];
}

/** Add a value to baggage */
export function getBaggageValue(baggage: Baggage, key: keyof BaggageObj): BaggageObj[keyof BaggageObj] {
  return baggage[0][key];
}

/** Add a value to baggage */
export function setBaggageValue(baggage: Baggage, key: keyof BaggageObj, value: BaggageObj[keyof BaggageObj]): void {
  baggage[0][key] = value;
}

/** Serialize a baggage object */
export function serializeBaggage(baggage: Baggage): string {
  return Object.keys(baggage[0]).reduce((prev, key) => {
    const baggageEntry = `${SENTRY_BAGGAGE_KEY_PREFIX}${key}=${baggage[0][key as keyof BaggageObj]}`;
    const newVal = prev === '' ? baggageEntry : `${prev},${baggageEntry}`;
    return newVal.length > MAX_BAGGAGE_STRING_LENGTH ? prev : newVal;
  }, baggage[1]);
}

/** Parse a baggage header to a string */
export function parseBaggageString(baggageString: string): Baggage {
  return baggageString.split(',').reduce(
    ([baggageObj, baggageString], curr) => {
      const [key, val] = curr.split('=');
      if (SENTRY_BAGGAGE_KEY_PREFIX_REGEX.test(key)) {
        return [
          {
            ...baggageObj,
            [key.split('-')[1]]: val,
          },
          baggageString,
        ];
      } else {
        return [baggageObj, baggageString === '' ? curr : `${baggageString},${curr}`];
      }
    },
    [{}, ''],
  );
}
