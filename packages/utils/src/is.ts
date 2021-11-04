/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

import { Primitive } from '@sentry/types';
/**
 * Checks whether given value's type is one of a few Error or Error-like
 * {@link isError}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isError(wat: any): wat is Error {
  switch (Object.prototype.toString.call(wat)) {
    case '[object Error]':
      return true;
    case '[object Exception]':
      return true;
    case '[object DOMException]':
      return true;
    default:
      return isInstanceOf(wat, Error);
  }
}

/**
 * Checks whether given value's type is ErrorEvent
 * {@link isErrorEvent}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isErrorEvent(wat: any): wat is ErrorEvent {
  return Object.prototype.toString.call(wat) === '[object ErrorEvent]';
}

/**
 * Checks whether given value's type is DOMError
 * {@link isDOMError}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isDOMError(wat: any): wat is DOMError {
  return Object.prototype.toString.call(wat) === '[object DOMError]';
}

/**
 * Checks whether given value's type is DOMException
 * {@link isDOMException}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isDOMException(wat: any): wat is DOMException {
  return Object.prototype.toString.call(wat) === '[object DOMException]';
}

/**
 * Checks whether the given value's type is string
 * {@link isString}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isString(wat: any): wat is string {
  return Object.prototype.toString.call(wat) === '[object String]';
}

/**
 * Checks whether given value's is a primitive (undefined, null, number, boolean, string, bigint, symbol)
 * {@link isPrimitive}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isPrimitive(wat: any): wat is Primitive {
  return wat === null || (typeof wat !== 'object' && typeof wat !== 'function');
}

/**
 * Checks whether given value's type is an object literal
 * {@link isPlainObject}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isPlainObject(wat: any): wat is { [key: string]: unknown } {
  return Object.prototype.toString.call(wat) === '[object Object]';
}

/**
 * Checks whether given value's type is an Event instance
 * {@link isEvent}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isEvent(wat: any): wat is Event {
  return typeof Event !== 'undefined' && isInstanceOf(wat, Event);
}

/**
 * Checks whether given value's type is an Element instance
 * {@link isElement}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isElement(wat: any): wat is Element {
  return typeof Element !== 'undefined' && isInstanceOf(wat, Element);
}

/**
 * Checks whether given value's type is an regexp
 * {@link isRegExp}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isRegExp(wat: any): wat is RegExp {
  return Object.prototype.toString.call(wat) === '[object RegExp]';
}

/**
 * Checks whether given value has a then function.
 * @param wat A value to be checked.
 */
export function isThenable(wat: any): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return Boolean(wat && wat.then && typeof wat.then === 'function');
}

/**
 * Checks whether given value's type is a SyntheticEvent
 * {@link isSyntheticEvent}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isSyntheticEvent(wat: any): boolean {
  return isPlainObject(wat) && 'nativeEvent' in wat && 'preventDefault' in wat && 'stopPropagation' in wat;
}

// Having the two different types is necessary because some types packages type classes as functions (in addition to
// being objects with a `new` method), and some only type them as `new`-able objects
type Constructor<T> = (...args: any[]) => T;
type ClassWithConstructor<T> = { new (...args: any[]): T };

/**
 * Checks whether given value's type is an instance of provided constructor.
 * {@link isInstanceOf}.
 *
 * @param wat A value to be checked.
 * @param base A constructor to be used in a check.
 * @returns A boolean representing the result.
 */
export function isInstanceOf<T>(wat: any, base: Constructor<T> | ClassWithConstructor<T>): wat is T {
  try {
    return wat instanceof base;
  } catch (_e) {
    return false;
  }
}
