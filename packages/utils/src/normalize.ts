import { isPrimitive, isSyntheticEvent } from './is';
import { memoBuilder, MemoFunc } from './memo';
import { convertToPlainObject } from './object';
import { getFunctionName } from './stacktrace';

type UnknownMaybeWithToJson = unknown & { toJSON?: () => string };

/**
 * Recursively normalizes the given object.
 *
 * - Creates a copy to prevent original input mutation
 * - Skips non-enumerable properties
 * - When stringifying, calls `toJSON` if implemented
 * - Removes circular references
 * - Translates non-serializable values (`undefined`/`NaN`/functions) to serializable format
 * - Translates known global objects/classes to a string representations
 * - Takes care of `Error` object serialization
 * - Optionally limits depth of final output
 * - Optionally limits number of properties/elements included in any single object/array
 *
 * @param input The object to be normalized.
 * @param depth The max depth to which to normalize the object. (Anything deeper stringified whole.)
 * @param maxProperties The max number of elements or properties to be included in any single array or
 * object in the normallized output..
 * @returns A normalized version of the object, or `"**non-serializable**"` if any errors are thrown during normalization.
 */
export function normalize(input: unknown, depth: number = +Infinity, maxProperties: number = +Infinity): any {
  try {
    // since we're at the outermost level, there is no key
    return walk('', input as UnknownMaybeWithToJson, depth, maxProperties);
  } catch (_oO) {
    return '**non-serializable**';
  }
}

/** JSDoc */
export function normalizeToSize<T>(
  object: { [key: string]: any },
  // Default Node.js REPL depth
  depth: number = 3,
  // 100kB, as 200kB is max payload size, so half sounds reasonable
  maxSize: number = 100 * 1024,
): T {
  const normalized = normalize(object, depth);

  if (jsonSize(normalized) > maxSize) {
    return normalizeToSize(object, depth - 1, maxSize);
  }

  return normalized as T;
}

/**
 * Walks an object to perform a normalization on it
 *
 * @param key of object that's walked in current iteration
 * @param value object to be walked
 * @param depth Optional number indicating how deep should walking be performed
 * @param maxProperties Optional maximum  number of properties/elements included in any single object/array
 * @param memo Optional Memo class handling decycling
 */
export function walk(
  key: string,
  value: UnknownMaybeWithToJson,
  depth: number = +Infinity,
  maxProperties: number = +Infinity,
  memo: MemoFunc = memoBuilder(),
): unknown {
  const [memoize, unmemoize] = memo;

  // If we reach the maximum depth, serialize whatever is left
  if (depth === 0) {
    return serializeValue(value);
  }

  // If value implements `toJSON` method, call it and return early
  if (value !== null && value !== undefined && typeof value.toJSON === 'function') {
    return value.toJSON();
  }

  // `makeSerializable` provides a string representation of certain non-serializable values. For all others, it's a
  // pass-through. If what comes back is a primitive (either because it's been stringified or because it was primitive
  // all along), we're done.
  const serializable = makeSerializable(value, key);
  if (isPrimitive(serializable)) {
    return serializable;
  }

  // Create source that we will use for the next iteration. It will either be an objectified error object (`Error` type
  // with extracted key:value pairs) or the input itself.
  const source = convertToPlainObject(value);

  // Create an accumulator that will act as a parent for all future itterations of that branch
  const acc: { [key: string]: any } = Array.isArray(value) ? [] : {};

  // If we already walked that branch, bail out, as it's circular reference
  if (memoize(value)) {
    return '[Circular ~]';
  }

  let propertyCount = 0;
  // Walk all keys of the source
  for (const innerKey in source) {
    // Avoid iterating over fields in the prototype if they've somehow been exposed to enumeration.
    if (!Object.prototype.hasOwnProperty.call(source, innerKey)) {
      continue;
    }

    if (propertyCount >= maxProperties) {
      acc[innerKey] = '[MaxProperties ~]';
      break;
    }

    propertyCount += 1;

    // Recursively walk through all the child nodes
    const innerValue = source[innerKey] as UnknownMaybeWithToJson;
    acc[innerKey] = walk(innerKey, innerValue, depth - 1, maxProperties, memo);
  }

  // Once walked through all the branches, remove the parent from memo storage
  unmemoize(value);

  // Return accumulated values
  return acc;
}

/**
 * Transform any non-primitive, BigInt, or Symbol-type value into a string. Acts as a no-op on strings, numbers,
 * booleans, null, and undefined.
 *
 * @param value The value to stringify
 * @returns For non-primitive, BigInt, and Symbol-type values, a string denoting the value's type, type and value, or
 *  type and `description` property, respectively. For non-BigInt, non-Symbol primitives, returns the original value,
 *  unchanged.
 */
function serializeValue(value: any): any {
  // Node.js REPL notation
  if (typeof value === 'string') {
    return value;
  }

  const type = Object.prototype.toString.call(value);
  if (type === '[object Object]') {
    return '[Object]';
  }
  if (type === '[object Array]') {
    return '[Array]';
  }

  // `makeSerializable` provides a string representation of certain non-serializable values. For all others, it's a
  // pass-through.
  const serializable = makeSerializable(value);
  return isPrimitive(serializable) ? serializable : type;
}

/**
 * makeSerializable()
 *
 * Takes unserializable input and make it serializer-friendly.
 *
 * Handles globals, functions, `undefined`, `NaN`, and other non-serializable values.
 */
function makeSerializable<T>(value: T, key?: any): T | string {
  if (key === 'domain' && value && typeof value === 'object' && (value as unknown as { _events: any })._events) {
    return '[Domain]';
  }

  if (key === 'domainEmitter') {
    return '[DomainEmitter]';
  }

  if (typeof (global as any) !== 'undefined' && (value as unknown) === global) {
    return '[Global]';
  }

  // It's safe to use `window` and `document` here in this manner, as we are asserting using `typeof` first
  // which won't throw if they are not present.

  // eslint-disable-next-line no-restricted-globals
  if (typeof (window as any) !== 'undefined' && (value as unknown) === window) {
    return '[Window]';
  }

  // eslint-disable-next-line no-restricted-globals
  if (typeof (document as any) !== 'undefined' && (value as unknown) === document) {
    return '[Document]';
  }

  // React's SyntheticEvent thingy
  if (isSyntheticEvent(value)) {
    return '[SyntheticEvent]';
  }

  if (typeof value === 'number' && value !== value) {
    return '[NaN]';
  }

  if (value === void 0) {
    return '[undefined]';
  }

  if (typeof value === 'function') {
    return `[Function: ${getFunctionName(value)}]`;
  }

  // symbols and bigints are considered primitives by TS, but aren't natively JSON-serilaizable

  if (typeof value === 'symbol') {
    return `[${String(value)}]`;
  }

  if (typeof value === 'bigint') {
    return `[BigInt: ${String(value)}]`;
  }

  return value;
}

/** Calculates bytes size of input string */
function utf8Length(value: string): number {
  // eslint-disable-next-line no-bitwise
  return ~-encodeURI(value).split(/%..|./).length;
}

/** Calculates bytes size of input object */
function jsonSize(value: any): number {
  return utf8Length(JSON.stringify(value));
}
