import { ExtendedError, WrappedFunction } from '@sentry/types';

import { isError, isPrimitive, isSyntheticEvent } from './is';
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
  if (!(name in source)) {
    return;
  }

  const original = source[name] as () => any;
  const wrapped = replacement(original) as WrappedFunction;

  // Make sure it's a function first, as we need to attach an empty prototype for `defineProperties` to work
  // otherwise it'll throw "TypeError: Object.defineProperties called on non-object"
  // tslint:disable-next-line:strict-type-predicates
  if (typeof wrapped === 'function') {
    try {
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
    } catch (_Oo) {
      // This can throw if multiple fill happens on a global object like XMLHttpRequest
      // Fixes https://github.com/getsentry/sentry-javascript/issues/2043
    }
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
function serializeValue(value: any): any {
  const type = Object.prototype.toString.call(value);

  // Node.js REPL notation
  if (typeof value === 'string') {
    return value;
  }
  if (type === '[object Object]') {
    return '[Object]';
  }
  if (type === '[object Array]') {
    return '[Array]';
  }

  const normalized = normalizeValue(value);
  return isPrimitive(normalized) ? normalized : type;
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

  if (Number.isNaN((value as unknown) as number)) {
    return '[NaN]';
  }

  if (value === void 0) {
    return '[undefined]';
  }

  if (typeof value === 'function') {
    return `[Function: ${value.name || '<unknown-function-name>'}]`;
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
export function walk(key: string, value: any, depth: number = +Infinity, memo: Memo = new Memo()): any {
  // If we reach the maximum depth, serialize whatever has left
  if (depth === 0) {
    return serializeValue(value);
  }

  // If value implements `toJSON` method, call it and return early
  // tslint:disable:no-unsafe-any
  if (value !== null && value !== undefined && typeof value.toJSON === 'function') {
    return value.toJSON();
  }
  // tslint:enable:no-unsafe-any

  // If normalized value is a primitive, there are no branches left to walk, so we can just bail out, as theres no point in going down that branch any further
  const normalized = normalizeValue(value, key);
  if (isPrimitive(normalized)) {
    return normalized;
  }

  // Create source that we will use for next itterations, either objectified error object (Error type with extracted keys:value pairs) or the input itself
  const source = (isError(value) ? objectifyError(value as Error) : value) as {
    [key: string]: any;
  };

  // Create an accumulator that will act as a parent for all future itterations of that branch
  const acc = Array.isArray(value) ? [] : {};

  // If we already walked that branch, bail out, as it's circular reference
  if (memo.memoize(value)) {
    return '[Circular ~]';
  }

  // Walk all keys of the source
  for (const innerKey in source) {
    // Avoid iterating over fields in the prototype if they've somehow been exposed to enumeration.
    if (!Object.prototype.hasOwnProperty.call(source, innerKey)) {
      continue;
    }
    // Recursively walk through all the child nodes
    (acc as { [key: string]: any })[innerKey] = walk(innerKey, source[innerKey], depth - 1, memo);
  }

  // Once walked through all the branches, remove the parent from memo storage
  memo.unmemoize(value);

  // Return accumulated values
  return acc;
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
export function normalize(input: any, depth?: number): any {
  try {
    // tslint:disable-next-line:no-unsafe-any
    return JSON.parse(JSON.stringify(input, (key: string, value: any) => walk(key, value, depth)));
  } catch (_oO) {
    return '**non-serializable**';
  }
}
