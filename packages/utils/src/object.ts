import { SentryWrappedFunction } from '@sentry/types';
import { isNaN, isPlainObject, isUndefined } from './is';

/**
 * Just an Error object with arbitrary attributes attached to it.
 */
interface ExtendedError extends Error {
  [key: string]: any;
}

/**
 * Serializes the given object into a string.
 * Like JSON.stringify, but doesn't throw on circular references.
 * Based on a `json-stringify-safe` package and modified to handle Errors serialization.
 *
 * The object must be serializable, i.e.:
 *  - Only primitive types are allowed (object, array, number, string, boolean)
 *  - Its depth should be considerably low for performance reasons
 *
 * @param object A JSON-serializable object.
 * @returns A string containing the serialized object.
 */
export function serialize<T>(object: T): string {
  return JSON.stringify(object);
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
  wrapped.__sentry__ = true;
  wrapped.__sentry_original__ = original;
  wrapped.__sentry_wrapped__ = wrapped;
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
function serializeValue<T>(value: T): T | string {
  const maxLength = 40;

  if (typeof value === 'string') {
    return value.length <= maxLength ? value : `${value.substr(0, maxLength - 1)}\u2026`;
  } else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'undefined') {
    return value;
  } else if (isNaN(value)) {
    // NaN and undefined are not JSON.parseable, but we want to preserve this information
    return '[NaN]';
  } else if (isUndefined(value)) {
    return '[undefined]';
  }

  const type = Object.prototype.toString.call(value);

  // Node.js REPL notation
  if (type === '[object Object]') {
    return '[Object]';
  }
  if (type === '[object Array]') {
    return '[Array]';
  }
  if (type === '[object Function]') {
    const name = ((value as any) as (() => void)).name;
    return name ? `[Function: ${name}]` : '[Function]';
  }

  return value;
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
  } else if (Array.isArray(value)) {
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
    return keys[0];
  }

  for (let includedKeys = keys.length; includedKeys > 0; includedKeys--) {
    const serialized = keys.slice(0, includedKeys).join(', ');
    if (serialized.length > maxLength) {
      continue;
    }
    if (includedKeys === keys.length) {
      return serialized;
    }
    return `${serialized}\u2026`;
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

  // tslint:disable-next-line
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
 * standardizeValue()
 *
 * translates undefined/NaN values to "[undefined]"/"[NaN]" respectively,
 * serializes Error objects
 * filter global objects
 */
function standardizeValue(value: any, key: any): any {
  if (key === 'domain' && typeof value === 'object' && (value as { _events: any })._events) {
    return '[Domain]';
  }

  if (key === 'domainEmitter') {
    return '[DomainEmitter]';
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

  if (value instanceof Date) {
    return `[Date] ${value}`;
  }

  if (value instanceof Error) {
    return objectifyError(value);
  }

  if (isNaN(value)) {
    return '[NaN]';
  }

  if (isUndefined(value)) {
    return '[undefined]';
  }

  if (typeof value === 'function') {
    return `[Function] ${(value as () => void).name || '<unknown-function-name>'}`;
  }

  return value;
}

/**
 * standardizer()
 *
 * Remove circular references,
 * translates undefined/NaN values to "[undefined]"/"[NaN]" respectively,
 * and takes care of Error objects serialization
 */
function standardizer(): (key: string, value: any) => any {
  const stack: any[] = [];
  const keys: string[] = [];

  /** recursive */
  function cycleStandardizer(_key: string, value: any): any {
    if (stack[0] === value) {
      return '[Circular ~]';
    }
    return `[Circular ~.${keys.slice(0, stack.indexOf(value)).join('.')}]`;
  }

  return function(this: any, key: string, value: any): any {
    if (stack.length > 0) {
      const thisPos = stack.indexOf(this);

      if (thisPos === -1) {
        stack.push(this);
        keys.push(key);
      } else {
        stack.splice(thisPos + 1);
        keys.splice(thisPos, Infinity, key);
      }

      if (stack.indexOf(value) !== -1) {
        // tslint:disable-next-line:no-parameter-reassignment
        value = cycleStandardizer.call(this, key, value);
      }
    } else {
      stack.push(value);
    }

    return standardizeValue(value, key);
  };
}

/**
 * safeNormalize()
 *
 * Creates a copy of the input by applying standardizer function on it and parsing it back to unify the data
 */
export function safeNormalize(input: any): any {
  try {
    return JSON.parse(JSON.stringify(input, standardizer()));
  } catch (_oO) {
    return '**non-serializable**';
  }
}
