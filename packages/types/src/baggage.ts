export type AllowedBaggageKeys = 'environment' | 'release' | 'userid' | 'transaction' | 'usersegment';
export type BaggageObj = Partial<Record<AllowedBaggageKeys, string> & Record<string, string>>;

/**
 * The baggage data structure represents key,value pairs based on the baggage
 * spec: https://www.w3.org/TR/baggage
 *
 * It is expected that users interact with baggage using the helpers methods:
 * `createBaggage`, `getBaggageValue`, and `setBaggageValue`.
 *
 * Internally, the baggage data structure is a tuple of length 3, separating baggage values
 * based on if they are related to Sentry or not. If the baggage values are
 * set/used by sentry, they will be stored in an object to be easily accessed.
 * If they are not, they are kept as a string to be only accessed when serialized
 * at baggage propagation time.
 * The third tuple member controls the mutability of the baggage. If it is `true`,
 * the baggage can not be modified any longer (i.e. is immutable).
 */
export type Baggage = [BaggageObj, string, boolean];
