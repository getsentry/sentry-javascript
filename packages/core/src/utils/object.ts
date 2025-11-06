/* eslint-disable @typescript-eslint/no-explicit-any */
import { DEBUG_BUILD } from '../debug-build';
import type { WrappedFunction } from '../types-hoist/wrappedfunction';
import { htmlTreeAsString } from './browser';
import { debug } from './debug-logger';
import { isElement, isError, isEvent, isInstanceOf, isPrimitive } from './is';

/**
 * Replace a method in an object with a wrapped version of itself.
 *
 * If the method on the passed object is not a function, the wrapper will not be applied.
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

  // explicitly casting to unknown because we don't know the type of the method initially at all
  const original = source[name] as unknown;

  if (typeof original !== 'function') {
    return;
  }

  const wrapped = replacementFactory(original) as WrappedFunction;

  // Make sure it's a function first, as we need to attach an empty prototype for `defineProperties` to work
  // otherwise it'll throw "TypeError: Object.defineProperties called on non-object"
  if (typeof wrapped === 'function') {
    markFunctionWrapped(wrapped, original);
  }

  try {
    source[name] = wrapped;
  } catch {
    DEBUG_BUILD && debug.log(`Failed to replace method "${name}" in object`, source);
  }
}

/**
 * Defines a non-enumerable property on the given object.
 *
 * @param obj The object on which to set the property
 * @param name The name of the property to be set
 * @param value The value to which to set the property
 */
export function addNonEnumerableProperty(obj: object, name: string, value: unknown): void {
  try {
    Object.defineProperty(obj, name, {
      // enumerable: false, // the default, so we can save on bundle size by not explicitly setting it
      value: value,
      writable: true,
      configurable: true,
    });
  } catch {
    DEBUG_BUILD && debug.log(`Failed to add non-enumerable property "${name}" to object`, obj);
  }
}

/**
 * Remembers the original function on the wrapped function and
 * patches up the prototype.
 *
 * @param wrapped the wrapper function
 * @param original the original function that gets wrapped
 */
export function markFunctionWrapped(wrapped: WrappedFunction, original: WrappedFunction): void {
  try {
    const proto = original.prototype || {};
    wrapped.prototype = original.prototype = proto;
    addNonEnumerableProperty(wrapped, '__sentry_original__', original);
  } catch {} // eslint-disable-line no-empty
}

/**
 * This extracts the original function if available.  See
 * `markFunctionWrapped` for more information.
 *
 * @param func the function to unwrap
 * @returns the unwrapped version of the function if available.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export function getOriginalFunction<T extends Function>(func: WrappedFunction<T>): T | undefined {
  return func.__sentry_original__;
}

/**
 * Transforms any `Error` or `Event` into a plain object with all of their enumerable properties, and some of their
 * non-enumerable properties attached.
 *
 * @param value Initial source that we have to transform in order for it to be usable by the serializer
 * @returns An Event or Error turned into an object - or the value argument itself, when value is neither an Event nor
 *  an Error.
 */
export function convertToPlainObject<V>(value: V):
  | {
      [ownProps: string]: unknown;
      type: string;
      target: string;
      currentTarget: string;
      detail?: unknown;
    }
  | {
      [ownProps: string]: unknown;
      message: string;
      name: string;
      stack?: string;
    }
  | V {
  if (isError(value)) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack,
      ...getOwnProperties(value),
    };
  } else if (isEvent(value)) {
    const newObj: {
      [ownProps: string]: unknown;
      type: string;
      target: string;
      currentTarget: string;
      detail?: unknown;
    } = {
      type: value.type,
      target: serializeEventTarget(value.target),
      currentTarget: serializeEventTarget(value.currentTarget),
      ...getOwnProperties(value),
    };

    if (typeof CustomEvent !== 'undefined' && isInstanceOf(value, CustomEvent)) {
      newObj.detail = value.detail;
    }

    return newObj;
  } else {
    return value;
  }
}

/** Creates a string representation of the target of an `Event` object */
function serializeEventTarget(target: unknown): string {
  try {
    return isElement(target) ? htmlTreeAsString(target) : Object.prototype.toString.call(target);
  } catch {
    return '<unknown>';
  }
}

/** Filters out all but an object's own properties */
function getOwnProperties(obj: unknown): { [key: string]: unknown } {
  if (typeof obj === 'object' && obj !== null) {
    const extractedProps: { [key: string]: unknown } = {};
    for (const property in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, property)) {
        extractedProps[property] = (obj as Record<string, unknown>)[property];
      }
    }
    return extractedProps;
  } else {
    return {};
  }
}

/**
 * Given any captured exception, extract its keys and create a sorted
 * and truncated list that will be used inside the event message.
 * eg. `Non-error exception captured with keys: foo, bar, baz`
 */
export function extractExceptionKeysForMessage(exception: Record<string, unknown>): string {
  const keys = Object.keys(convertToPlainObject(exception));
  keys.sort();

  return !keys[0] ? '[object has no keys]' : keys.join(', ');
}

/**
 * Given any object, return a new object having removed all fields whose value was `undefined`.
 * Works recursively on objects and arrays.
 *
 * Attention: This function keeps circular references in the returned object.
 *
 * @deprecated This function is no longer used by the SDK and will be removed in a future major version.
 */
export function dropUndefinedKeys<T>(inputValue: T): T {
  // This map keeps track of what already visited nodes map to.
  // Our Set - based memoBuilder doesn't work here because we want to the output object to have the same circular
  // references as the input object.
  const memoizationMap = new Map<unknown, unknown>();

  // This function just proxies `_dropUndefinedKeys` to keep the `memoBuilder` out of this function's API
  return _dropUndefinedKeys(inputValue, memoizationMap);
}

function _dropUndefinedKeys<T>(inputValue: T, memoizationMap: Map<unknown, unknown>): T {
  // Early return for primitive values
  if (inputValue === null || typeof inputValue !== 'object') {
    return inputValue;
  }

  // Check memo map first for all object types
  const memoVal = memoizationMap.get(inputValue);
  if (memoVal !== undefined) {
    return memoVal as T;
  }

  // handle arrays
  if (Array.isArray(inputValue)) {
    const returnValue: unknown[] = [];
    // Store mapping to handle circular references
    memoizationMap.set(inputValue, returnValue);

    inputValue.forEach(value => {
      returnValue.push(_dropUndefinedKeys(value, memoizationMap));
    });

    return returnValue as unknown as T;
  }

  if (isPojo(inputValue)) {
    const returnValue: { [key: string]: unknown } = {};
    // Store mapping to handle circular references
    memoizationMap.set(inputValue, returnValue);

    const keys = Object.keys(inputValue);

    keys.forEach(key => {
      const val = inputValue[key];
      if (val !== undefined) {
        returnValue[key] = _dropUndefinedKeys(val, memoizationMap);
      }
    });

    return returnValue as T;
  }

  // For other object types, return as is
  return inputValue;
}

function isPojo(input: unknown): input is Record<string, unknown> {
  // Plain objects have Object as constructor or no constructor
  const constructor = (input as object).constructor;
  return constructor === Object || constructor === undefined;
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
    // this will catch both undefined and null
    case wat == undefined:
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
