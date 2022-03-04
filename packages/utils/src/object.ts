/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExtendedError, WrappedFunction } from '@sentry/types';

import { htmlTreeAsString } from './browser';
import { isElement, isError, isEvent, isInstanceOf, isPlainObject, isPrimitive, isSyntheticEvent } from './is';
import { memoBuilder } from './memo';
import { getFunctionName } from './stacktrace';
import { truncate } from './string';

/**
 * Replace a method in an object with a wrapped version of itself.
 *
 * @param source An object that contains a method to be wrapped.
 * @param name The name of the method to be wrapped.
 * @param replacementFactory A higher-order function that takes the original version of the given method and returns a
 * wrapped version. Note: The function returned by `replacementFactory` needs to be a non-arrow function, in order to
 * preserve the correct value of `this`, and the original method must be called using `origMethod.call(this, <other
 * args>)` or `origMethod.apply(this, [<other args>])` (rather than being called directly), again to preserve `this`.
 * @returns void
 */
export function fill(source: { [key: string]: any }, name: string, replacementFactory: (...args: any[]) => any): void {
  if (!(name in source)) {
    return;
  }

  const original = source[name] as () => any;
  const wrapped = replacementFactory(original) as WrappedFunction;

  // Make sure it's a function first, as we need to attach an empty prototype for `defineProperties` to work
  // otherwise it'll throw "TypeError: Object.defineProperties called on non-object"
  if (typeof wrapped === 'function') {
    try {
      markFunctionWrapped(wrapped, original);
    } catch (_Oo) {
      // This can throw if multiple fill happens on a global object like XMLHttpRequest
      // Fixes https://github.com/getsentry/sentry-javascript/issues/2043
    }
  }

  source[name] = wrapped;
}

/**
 * Defines a non-enumerable property on the given object.
 *
 * @param obj The object on which to set the property
 * @param name The name of the property to be set
 * @param value The value to which to set the property
 */
export function addNonEnumerableProperty(obj: { [key: string]: unknown }, name: string, value: unknown): void {
  Object.defineProperty(obj, name, {
    // enumerable: false, // the default, so we can save on bundle size by not explicitly setting it
    value: value,
    writable: true,
    configurable: true,
  });
}

/**
 * Remembers the original function on the wrapped function and
 * patches up the prototype.
 *
 * @param wrapped the wrapper function
 * @param original the original function that gets wrapped
 */
export function markFunctionWrapped(wrapped: WrappedFunction, original: WrappedFunction): void {
  const proto = original.prototype || {};
  wrapped.prototype = original.prototype = proto;
  addNonEnumerableProperty(wrapped, '__sentry_original__', original);
}

/**
 * This extracts the original function if available.  See
 * `markFunctionWrapped` for more information.
 *
 * @param func the function to unwrap
 * @returns the unwrapped version of the function if available.
 */
export function getOriginalFunction(func: WrappedFunction): WrappedFunction | undefined {
  return func.__sentry_original__;
}

/**
 * Encodes given object into url-friendly format
 *
 * @param object An object that contains serializable values
 * @returns string Encoded
 */
export function urlEncode(object: { [key: string]: any }): string {
  return Object.keys(object)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(object[key])}`)
    .join('&');
}

/**
 * Transforms any object into an object literal with all its attributes
 * attached to it.
 *
 * @param value Initial source that we have to transform in order for it to be usable by the serializer
 */
function getWalkSource(value: any): {
  [key: string]: any;
} {
  if (isError(value)) {
    const error = value as ExtendedError;
    const err: {
      [key: string]: any;
      stack: string | undefined;
      message: string;
      name: string;
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

  if (isEvent(value)) {
    /**
     * Event-like interface that's usable in browser and node
     */
    interface SimpleEvent {
      [key: string]: unknown;
      type: string;
      target?: unknown;
      currentTarget?: unknown;
    }

    const event = value as unknown as SimpleEvent;

    const source: {
      [key: string]: any;
    } = {};

    // Accessing event attributes can throw (see https://github.com/getsentry/sentry-javascript/issues/768 and
    // https://github.com/getsentry/sentry-javascript/issues/838), but accessing `type` hasn't been wrapped in a
    // try-catch in at least two years and no one's complained, so that's likely not an issue anymore
    source.type = event.type;

    try {
      source.target = isElement(event.target)
        ? htmlTreeAsString(event.target)
        : Object.prototype.toString.call(event.target);
    } catch (_oO) {
      source.target = '<unknown>';
    }

    try {
      source.currentTarget = isElement(event.currentTarget)
        ? htmlTreeAsString(event.currentTarget)
        : Object.prototype.toString.call(event.currentTarget);
    } catch (_oO) {
      source.currentTarget = '<unknown>';
    }

    if (typeof CustomEvent !== 'undefined' && isInstanceOf(value, CustomEvent)) {
      source.detail = event.detail;
    }

    for (const attr in event) {
      if (Object.prototype.hasOwnProperty.call(event, attr)) {
        source[attr] = event[attr];
      }
    }

    return source;
  }

  return value as {
    [key: string]: any;
  };
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
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function normalize(input: any, maxDepth: number = +Infinity, maxEdges: number = 10_000): any {
  const [memoize, unmemoize] = memoBuilder();
  let edges = 0;

  function walker(key: string, value: any, depth: number): any {
    // If we reach the maximum depth, serialize whatever is left
    if (depth === 0) {
      edges += 1;
      return serializeValue(value);
    }

    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    // If value implements `toJSON` method, call it and return early
    if (value !== null && value !== undefined && typeof value.toJSON === 'function') {
      edges += 1;
      return value.toJSON();
    }
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */

    // `makeSerializable` provides a string representation of certain non-serializable values. For all others, it's a
    // pass-through. If what comes back is a primitive (either because it's been stringified or because it was primitive
    // all along), we're done.
    const serializable = makeSerializable(value, key);
    if (isPrimitive(serializable)) {
      edges += 1;
      return serializable;
    }

    // Create source that we will use for the next iteration. It will either be an objectified error object (`Error` type
    // with extracted key:value pairs) or the input itself.
    const source = getWalkSource(value);

    // Create an accumulator that will act as a parent for all future itterations of that branch
    const acc: { [key: string]: any } = Array.isArray(value) ? [] : {};

    // If we already walked that branch, bail out, as it's circular reference
    if (memoize(value)) {
      edges += 1;
      return '[Circular ~]';
    }

    // Walk all keys of the source
    for (const innerKey in source) {
      // Avoid iterating over fields in the prototype if they've somehow been exposed to enumeration.
      if (!Object.prototype.hasOwnProperty.call(source, innerKey)) {
        continue;
      }

      if (edges >= maxEdges) {
        acc[innerKey] = '[Max Edges Reached...]';
        break;
      }

      // Recursively walk through all the child nodes
      const innerValue: any = source[innerKey];
      acc[innerKey] = walker(innerKey, innerValue, depth - 1);
    }

    // Once walked through all the branches, remove the parent from memo storage
    unmemoize(value);

    // Return accumulated values
    return acc;
  }

  try {
    // since we're at the outermost level, there is no key
    return walker('', input, maxDepth);
  } catch (_oO) {
    return '**non-serializable**';
  }
}

/**
 * Given any captured exception, extract its keys and create a sorted
 * and truncated list that will be used inside the event message.
 * eg. `Non-error exception captured with keys: foo, bar, baz`
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function extractExceptionKeysForMessage(exception: any, maxLength: number = 40): string {
  const keys = Object.keys(getWalkSource(exception));
  keys.sort();

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

/**
 * Given any object, return the new object with removed keys that value was `undefined`.
 * Works recursively on objects and arrays.
 */
export function dropUndefinedKeys<T>(val: T): T {
  if (isPlainObject(val)) {
    const obj = val as { [key: string]: any };
    const rv: { [key: string]: any } = {};
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] !== 'undefined') {
        rv[key] = dropUndefinedKeys(obj[key]);
      }
    }
    return rv as T;
  }

  if (Array.isArray(val)) {
    return (val as any[]).map(dropUndefinedKeys) as any;
  }

  return val;
}

/**
 * Ensure that something is an object.
 *
 * Turns `undefined` and `null` into `String`s and all other primitives into instances of their respective wrapper
 * classes (String, Boolean, Number, etc.). Acts as the identity function on non-primitives.
 *
 * @param wat The subject of the objectification
 * @returns A version of `wat` which can safely be used with `Object` class methods
 */
export function objectify(wat: unknown): typeof Object {
  let objectified;
  switch (true) {
    case wat === undefined || wat === null:
      objectified = new String(wat);
      break;

    // Though symbols and bigints do have wrapper classes (`Symbol` and `BigInt`, respectively), for whatever reason
    // those classes don't have constructors which can be used with the `new` keyword. We therefore need to cast each as
    // an object in order to wrap it.
    case typeof wat === 'symbol' || typeof wat === 'bigint':
      objectified = Object(wat);
      break;

    // this will catch the remaining primitives: `String`, `Number`, and `Boolean`
    case isPrimitive(wat):
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      objectified = new (wat as any).constructor(wat);
      break;

    // by process of elimination, at this point we know that `wat` must already be an object
    default:
      objectified = wat;
      break;
  }
  return objectified;
}
