export type AllowedBaggageKeys = 'environment' | 'release'; // TODO: Add remaining allowed baggage keys | 'transaction' | 'userid' | 'usersegment';
export type Baggage = Partial<Record<AllowedBaggageKeys, string> & Record<string, string>>;

export const BAGGAGE_HEADER_NAME = 'baggage';

/**
 * Max length of a serialized baggage string
 *
 * https://www.w3.org/TR/baggage/#limits
 */
export const MAX_BAGGAGE_STRING_LENGTH = 8192;

/** Create an instance of Baggage */
export function createBaggage(initItems: Baggage): Baggage {
  return { ...initItems };
}

/** Add a value to baggage */
export function getBaggageValue(baggage: Baggage, key: keyof Baggage): Baggage[keyof Baggage] {
  return baggage[key];
}

/** Add a value to baggage */
export function setBaggageValue(baggage: Baggage, key: keyof Baggage, value: Baggage[keyof Baggage]): void {
  baggage[key] = value;
}

/** remove a value from baggage */
// TODO: Is this even useful?
// export function removeBaggageValue(baggage: Baggage, key: keyof Baggage): void {
//   // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
//   delete baggage[key];
// }

/** Serialize a baggage object */
export function serializeBaggage(baggage: Baggage): string {
  return Object.keys(baggage).reduce((prev, key) => {
    const newVal = `${prev};${key}=${baggage[key as keyof Baggage]}`;
    return newVal.length > MAX_BAGGAGE_STRING_LENGTH ? prev : newVal;
  }, '');
}

/** Parse a baggage header to a string */
export function parseBaggageString(baggageString: string): Baggage {
  // TODO: Should we check validity with regex? How much should we check for malformed baggage keys?
  // Perhaps we shouldn't worry about this being used in the frontend, so bundle size isn't that much of a concern
  return baggageString.split(';').reduce((prevBaggage, curr) => {
    const [key, val] = curr.split('=');
    return {
      ...prevBaggage,
      [key]: val,
    };
  }, {} as Baggage);
}
