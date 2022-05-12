export type AllowedBaggageKeys = 'environment' | 'release'; // TODO: Add remaining allowed baggage keys | 'transaction' | 'userid' | 'usersegment';
export type BaggageObj = Partial<Record<AllowedBaggageKeys, string> & Record<string, string>>;

/**
 * The baggage data structure represents key,value pairs based on the baggage
 * spec: https://www.w3.org/TR/baggage
 *
 * It is expected that users interact with baggage using the helpers methods:
 * `createBaggage`, `getBaggageValue`, and `setBaggageValue`.
 *
 * Internally, the baggage data structure is a tuple of length 2, seperating baggage values
 * based on if they are related to Sentry or not. If the baggage values are
 * set/used by sentry, they will be stored in an object to be easily accessed.
 * If they are not, they are kept as a string to be only accessed when serialized
 * at baggage propogation time.
 */
export type Baggage = [BaggageObj, string];

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
    const val = baggage[0][key as keyof BaggageObj] as string;
    const baggageEntry = `${SENTRY_BAGGAGE_KEY_PREFIX}${encodeURIComponent(key)}=${encodeURIComponent(val)}`;
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
        const baggageKey = decodeURIComponent(key.split('-')[1]);
        return [
          {
            ...baggageObj,
            [baggageKey]: decodeURIComponent(val),
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
