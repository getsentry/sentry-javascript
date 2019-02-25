import { SentryWrappedFunction } from '@sentry/types';
import { isArray, isError, isNaN, isPlainObject, isPrimitive, isSyntheticEvent, isUndefined } from './is';
import { Memo } from './memo';
import { truncate } from './string';

/**
 * Just an Error object with arbitrary attributes attached to it.
 */
interface ExtendedError extends Error {
  [key: string]: any;
}

/**
 * Serializes the given object into a string.
 * Like JSON.stringify, but doesn't throw on circular references.
 *
 * @param object A JSON-serializable object.
 * @returns A string containing the serialized object.
 */
export function serialize<T>(object: T): string {
  return JSON.stringify(object, serializer({ normalize: false }));
}

/**
 * Deserializes an object from a string previously serialized with
 * {@link serialize}.
 *
 * @param str A serialized object.
 * @returns The deserialized object.
 */
export function deserialize<T>(str: string): T {
  return JSON.parse(str) as T;
}

/**
 * Creates a deep copy of the given object.
 *
 * The object must be serializable, i.e.:
 *  - It must not contain any cycles
 *  - Only primitive types are allowed (object, array, number, string, boolean)
 *  - Its depth should be considerably low for performance reasons
 *
 * @param object A JSON-serializable object.
 * @returns The object clone.
 */
export function clone<T>(object: T): T {
  return deserialize(serialize(object));
}

/**
 * Wrap a given object method with a higher-order function
 *
 * @param source An object that contains a method to be wrapped.
 * @param name A name of method to be wrapped.
 * @param replacement A function that should be used to wrap a given method.
 * @returns void
 */

export function fill(source: { [key: string]: any }, name: string, replacement: (...args: any[]) => any): void {
  if (!(name in source) || (source[name] as SentryWrappedFunction).__sentry__) {
    return;
  }
  const original = source[name] as () => any;
  const wrapped = replacement(original) as SentryWrappedFunction;

  // Make sure it's a function first, as we need to attach an empty prototype for `defineProperties` to work
  // otherwise it'll throw "TypeError: Object.defineProperties called on non-object"
  // tslint:disable-next-line:strict-type-predicates
  if (typeof wrapped === 'function') {
    wrapped.prototype = wrapped.prototype || {};
    Object.defineProperties(wrapped, {
      __sentry__: {
        enumerable: false,
        value: true,
      },
      __sentry_original__: {
        enumerable: false,
        value: original,
      },
      __sentry_wrapped__: {
        enumerable: false,
        value: wrapped,
      },
    });
  }

  source[name] = wrapped;
}

/**
 * Encodes given object into url-friendly format
 *
 * @param object An object that contains serializable values
 * @returns string Encoded
 */
export function urlEncode(object: { [key: string]: any }): string {
  return Object.keys(object)
    .map(
      // tslint:disable-next-line:no-unsafe-any
      key => `${encodeURIComponent(key)}=${encodeURIComponent(object[key])}`,
    )
    .join('&');
}

// Default Node.js REPL depth
const MAX_SERIALIZE_EXCEPTION_DEPTH = 3;
// 100kB, as 200kB is max payload size, so half sounds reasonable
const MAX_SERIALIZE_EXCEPTION_SIZE = 100 * 1024;
const MAX_SERIALIZE_KEYS_LENGTH = 40;

/** JSDoc */
function utf8Length(value: string): number {
  // tslint:disable-next-line:no-bitwise
  return ~-encodeURI(value).split(/%..|./).length;
}

/** JSDoc */
function jsonSize(value: any): number {
  return utf8Length(JSON.stringify(value));
}

/** JSDoc */
function serializeValue(value: any): string {
  const type = Object.prototype.toString.call(value);

  // Node.js REPL notation
  if (typeof value === 'string') {
    return truncate(value, 40);
  } else if (type === '[object Object]') {
    return '[Object]';
  } else if (type === '[object Array]') {
    return '[Array]';
  } else {
    const normalized = normalizeValue(value);
    return isPrimitive(normalized) ? `${normalized}` : (type as string);
  }
}

/** JSDoc */
export function serializeObject<T>(value: T, depth: number): T | string | {} {
  if (depth === 0) {
    return serializeValue(value);
  }

  if (isPlainObject(value)) {
    const serialized: { [key: string]: any } = {};
    const val = value as {
      [key: string]: any;
    };

    Object.keys(val).forEach((key: string) => {
      serialized[key] = serializeObject(val[key], depth - 1);
    });

    return serialized;
  } else if (isArray(value)) {
    const val = (value as any) as T[];
    return val.map(v => serializeObject(v, depth - 1));
  }

  return serializeValue(value);
}

/** JSDoc */
export function limitObjectDepthToSize<T>(
  object: { [key: string]: any },
  depth: number = MAX_SERIALIZE_EXCEPTION_DEPTH,
  maxSize: number = MAX_SERIALIZE_EXCEPTION_SIZE,
): T {
  const serialized = serializeObject(object, depth);

  if (jsonSize(serialize(serialized)) > maxSize) {
    return limitObjectDepthToSize(object, depth - 1);
  }

  return serialized as T;
}

/** JSDoc */
export function serializeKeysToEventMessage(keys: string[], maxLength: number = MAX_SERIALIZE_KEYS_LENGTH): string {
  if (!keys.length) {
    return '[object has no keys]';
  }

  if (keys[0].length >= maxLength) {
    return truncate(keys[0], maxLength);
  }

  for (let includedKeys = keys.length; includedKeys > 0; includedKeys--) {
    const serialized = keys.slice(0, includedKeys).join(', ');
    if (serialized.length > maxLength) {
      continue;
    }
    if (includedKeys === keys.length) {
      return serialized;
    }
    return truncate(serialized, maxLength);
  }

  return '';
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign#Polyfill
/** JSDoc */
export function assign(target: any, ...args: any[]): object {
  if (target === null || target === undefined) {
    throw new TypeError('Cannot convert undefined or null to object');
  }

  const to = Object(target) as {
    [key: string]: any;
  };

  // tslint:disable-next-line:prefer-for-of
  for (let i = 0; i < args.length; i++) {
    const source = args[i];
    if (source !== null) {
      for (const nextKey in source as {
        [key: string]: any;
      }) {
        if (Object.prototype.hasOwnProperty.call(source, nextKey)) {
          to[nextKey] = (source as {
            [key: string]: any;
          })[nextKey];
        }
      }
    }
  }

  return to;
}

/**
 * Transforms Error object into an object literal with all it's attributes
 * attached to it.
 *
 * Based on: https://github.com/ftlabs/js-abbreviate/blob/fa709e5f139e7770a71827b1893f22418097fbda/index.js#L95-L106
 *
 * @param error An Error containing all relevant information
 * @returns An object with all error properties
 */
function objectifyError(error: ExtendedError): object {
  // These properties are implemented as magical getters and don't show up in `for-in` loop
  const err: {
    stack: string | undefined;
    message: string;
    name: string;
    [key: string]: any;
  } = {
    message: error.message,
    name: error.name,
    stack: error.stack,
  };

  for (const i in error) {
    if (Object.prototype.hasOwnProperty.call(error, i)) {
      err[i] = error[i];
    }
  }

  return err;
}

/**
 * normalizeValue()
 *
 * Takes unserializable input and make it serializable friendly
 *
 * - translates undefined/NaN values to "[undefined]"/"[NaN]" respectively,
 * - serializes Error objects
 * - filter global objects
 */
function normalizeValue<T>(value: T, key?: any): T | string {
  if (key === 'domain' && typeof value === 'object' && ((value as unknown) as { _events: any })._events) {
    return '[Domain]';
  }

  if (key === 'domainEmitter') {
    return '[DomainEmitter]';
  }

  if (typeof (global as any) !== 'undefined' && (value as unknown) === global) {
    return '[Global]';
  }

  if (typeof (window as any) !== 'undefined' && (value as unknown) === window) {
    return '[Window]';
  }

  if (typeof (document as any) !== 'undefined' && (value as unknown) === document) {
    return '[Document]';
  }

  // tslint:disable-next-line:strict-type-predicates
  if (typeof Event !== 'undefined' && value instanceof Event) {
    return Object.getPrototypeOf(value) ? value.constructor.name : 'Event';
  }

  // React's SyntheticEvent thingy
  if (isSyntheticEvent(value)) {
    return '[SyntheticEvent]';
  }

  if (isNaN(value)) {
    return '[NaN]';
  }

  if (isUndefined(value)) {
    return '[undefined]';
  }

  if (typeof value === 'function') {
    return `[Function: ${value.name || '<unknown-function-name>'}]`;
  }

  return value;
}

/**
 * Decycles an object to make it safe for json serialization.
 *
 * @param obj Object to be decycled
 * @param memo Optional Memo class handling decycling
 */
export function decycle(obj: any, depth: number = +Infinity, memo: Memo = new Memo()): any {
  if (depth === 0) {
    return serializeValue(obj);
  }

  // If an object was normalized to its string form, we should just bail out as theres no point in going down that branch
  const normalized = normalizeValue(obj);
  if (isPrimitive(normalized)) {
    return normalized;
  }

  // tslint:disable-next-line:no-unsafe-any
  const source = (isError(obj) ? objectifyError(obj) : obj) as {
    [key: string]: any;
  };
  const copy = isArray(obj) ? [] : {};

  if (memo.memoize(obj)) {
    return '[Circular ~]';
  }
  for (const key in source) {
    // Avoid iterating over fields in the prototype if they've somehow been exposed to enumeration.
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      continue;
    }
    (copy as { [key: string]: any })[key] = decycle(source[key], depth - 1, memo);
  }
  memo.unmemoize(obj);

  return copy;
}

/**
 * serializer()
 *
 * Remove circular references,
 * translates undefined/NaN values to "[undefined]"/"[NaN]" respectively,
 * and takes care of Error objects serialization
 */
function serializer(
  options: { normalize?: boolean; depth?: number } = { normalize: true },
): (key: string, value: any) => any {
  return (key: string, value: object) =>
    // tslint:disable-next-line
    options.normalize ? normalizeValue(decycle(value, options.depth), key) : decycle(value, options.depth);
}

/**
 * safeNormalize()
 *
 * Creates a copy of the input by applying serializer function on it and parsing it back to unify the data
 */
export function safeNormalize(input: any, depth?: number): any {
  try {
    return JSON.parse(JSON.stringify(input, serializer({ normalize: true, depth })));
  } catch (_oO) {
    return '**non-serializable**';
  }
}
