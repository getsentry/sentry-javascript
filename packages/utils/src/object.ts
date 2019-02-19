import { ExtendedError, WrappedFunction } from '@sentry/types';
import { isError, isPlainObject, isPrimitive, isSyntheticEvent } from './is';
import { Memo } from './memo';

/**
 * Wrap a given object method with a higher-order function
 *
 * @param source An object that contains a method to be wrapped.
 * @param name A name of method to be wrapped.
 * @param replacement A function that should be used to wrap a given method.
 * @returns void
 */

export function fill(source: { [key: string]: any }, name: string, replacement: (...args: any[]) => any): void {
  if (!(name in source) || (source[name] as WrappedFunction).__sentry__) {
    return;
  }
  const original = source[name] as () => any;
  const wrapped = replacement(original) as WrappedFunction;

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

/** Calculates bytes size of input string */
function utf8Length(value: string): number {
  // tslint:disable-next-line:no-bitwise
  return ~-encodeURI(value).split(/%..|./).length;
}

/** Calculates bytes size of input object */
function jsonSize(value: any): number {
  return utf8Length(JSON.stringify(value));
}

/** JSDoc */
export function normalizeToSize<T>(
  object: { [key: string]: any },
  // Default Node.js REPL depth
  depth: number = 3,
  // 100kB, as 200kB is max payload size, so half sounds reasonable
  maxSize: number = 100 * 1024,
): T {
  const serialized = normalize(object, depth);

  if (jsonSize(serialized) > maxSize) {
    return normalizeToSize(object, depth - 1, maxSize);
  }

  return serialized as T;
}

/** Transforms any input value into a string form, either primitive value or a type of the input */
function stringifyValue<T>(value: T): T | string {
  // Node.js REPL notation
  const type = Object.prototype.toString.call(value) as string;

  if (isPrimitive(value)) {
    return value;
  } else if (type === '[object Object]') {
    return '[Object]';
  } else if (type === '[object Array]') {
    return '[Array]';
  } else {
    return type;
  }
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
function normalizeValue(value: any, key?: any): any {
  if (isError(value)) {
    // tslint:disable-next-line:no-unsafe-any
    return objectifyError(value);
  }

  if (typeof (global as any) !== 'undefined' && value === global) {
    return '[Global]';
  }

  if (typeof (window as any) !== 'undefined' && value === window) {
    return '[Window]';
  }

  if (typeof (document as any) !== 'undefined' && value === document) {
    return '[Document]';
  }

  if (key === 'domain' && typeof value === 'object' && (value as { _events: any })._events) {
    return '[Domain]';
  }

  if (key === 'domainEmitter') {
    return '[DomainEmitter]';
  }

  // React's SyntheticEvent thingy
  if (isSyntheticEvent(value)) {
    return '[SyntheticEvent]';
  }

  // tslint:disable-next-line:strict-type-predicates
  if (typeof Event !== 'undefined' && value instanceof Event) {
    return Object.getPrototypeOf(value) ? value.constructor.name : 'Event';
  }

  if (Number.isNaN(value as number)) {
    return '[NaN]';
  }

  if (value === void 0) {
    return '[undefined]';
  }

  if (typeof value === 'function') {
    return `[Function: ${(value as () => void).name || '<unknown-function-name>'}]`;
  }

  return value;
}

/**
 * Walks an object to perform a normalization on it
 *
 * @param key of object that's walked in current iteration
 * @param value object to be walked
 * @param depth Optional number indicating how deep should walking be performed
 * @param memo Optional Memo class handling decycling
 */
export function walk(key: string, value: any, depth: number, memo: Memo = new Memo()): any {
  // tslint:disable:no-unsafe-any

  // If we reach the maximum depth, stringify whatever left out of it
  if (depth === 0) {
    return stringifyValue(value);
  }

  // If value implements `toJSON` method, call it and return early
  if (value !== null && value !== undefined && typeof value.toJSON === 'function') {
    return value.toJSON();
  }

  const normalized = normalizeValue(value, key);
  // If its a primitive, there are no branches left to walk, so we can just bail out as theres no point in going down that branch any further
  if (isPrimitive(normalized)) {
    return normalized;
  }

  // Make a copy of the value to prevent any mutations
  const copy = Array.isArray(normalized) ? [...normalized] : isPlainObject(normalized) ? { ...normalized } : normalized;

  // If we already walked that branch, bail out
  if (memo.memoize(value)) {
    return '[Circular ~]';
  }

  for (const innerKey in normalized) {
    // Avoid iterating over fields in the prototype if they've somehow been exposed to enumeration.
    if (!Object.prototype.hasOwnProperty.call(normalized, innerKey)) {
      continue;
    }
    copy[innerKey] = walk(innerKey, normalized[innerKey], depth - 1, memo);
  }

  memo.unmemoize(value);

  return copy;
}

/**
 * normalize()
 *
 * - Creates a copy to prevent original input mutation
 * - Skip non-enumerablers
 * - Calls `toJSON` if implemented
 * - Removes circular references
 * - Translates non-serializeable values (undefined/NaN/Functions) to serializable format
 * - Translates known global objects/Classes to a string representations
 * - Takes care of Error objects serialization
 * - Optionally limit depth of final output
 */
export function normalize(input: any, depth: number = +Infinity): any {
  try {
    return JSON.parse(JSON.stringify(input, (key: string, value: any) => walk(key, value, depth)));
  } catch (_oO) {
    return '**non-serializable**';
  }
}
