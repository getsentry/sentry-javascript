/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Primitive } from '../types/misc';
import type { ParameterizedString } from '../types/parameterize';
import type { PolymorphicEvent } from '../types/polymorphics';
import type { VNode, VueViewModel } from '../types/vue';

// eslint-disable-next-line @typescript-eslint/unbound-method
const objectToString = Object.prototype.toString;

/**
 * Checks whether given value's type is one of a few Error or Error-like
 * {@link isError}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isError(wat: unknown): wat is Error {
  switch (objectToString.call(wat)) {
    case '[object Error]':
    case '[object Exception]':
    case '[object DOMException]':
    case '[object WebAssembly.Exception]':
      return true;
    default:
      return isInstanceOf(wat, Error);
  }
}
/**
 * Checks whether given value is an instance of the given built-in class.
 *
 * @param wat The value to be checked
 * @param className
 * @returns A boolean representing the result.
 */
function isBuiltin(wat: unknown, className: string): boolean {
  return objectToString.call(wat) === `[object ${className}]`;
}

/**
 * Checks whether given value's type is ErrorEvent
 * {@link isErrorEvent}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isErrorEvent(wat: unknown): boolean {
  return isBuiltin(wat, 'ErrorEvent');
}

/**
 * Checks whether given value's type is DOMError
 * {@link isDOMError}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isDOMError(wat: unknown): boolean {
  return isBuiltin(wat, 'DOMError');
}

/**
 * Checks whether given value's type is DOMException
 * {@link isDOMException}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isDOMException(wat: unknown): boolean {
  return isBuiltin(wat, 'DOMException');
}

/**
 * Checks whether given value's type is a string
 * {@link isString}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isString(wat: unknown): wat is string {
  return isBuiltin(wat, 'String');
}

/**
 * Checks whether given string is parameterized
 * {@link isParameterizedString}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isParameterizedString(wat: unknown): wat is ParameterizedString {
  return (
    typeof wat === 'object' &&
    wat !== null &&
    '__sentry_template_string__' in wat &&
    '__sentry_template_values__' in wat
  );
}

/**
 * Checks whether given value is a primitive (undefined, null, number, boolean, string, bigint, symbol)
 * {@link isPrimitive}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isPrimitive(wat: unknown): wat is Primitive {
  return wat === null || isParameterizedString(wat) || (typeof wat !== 'object' && typeof wat !== 'function');
}

/**
 * Checks whether given value's type is an object literal, or a class instance.
 * {@link isPlainObject}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isPlainObject(wat: unknown): wat is Record<string, unknown> {
  return isBuiltin(wat, 'Object');
}

/**
 * Checks whether given value's type is an Event instance
 * {@link isEvent}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isEvent(wat: unknown): wat is PolymorphicEvent {
  return typeof Event !== 'undefined' && isInstanceOf(wat, Event);
}

/**
 * Checks whether given value's type is an Element instance
 * {@link isElement}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 * @deprecated This is browser-specific and will be removed from `@sentry/core` in a future major version.
 * Import `isElement` from `@sentry/browser-utils` instead.
 */
export function isElement(wat: unknown): boolean {
  return typeof Element !== 'undefined' && isInstanceOf(wat, Element);
}

/**
 * Checks whether given value's type is an regexp
 * {@link isRegExp}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isRegExp(wat: unknown): wat is RegExp {
  return isBuiltin(wat, 'RegExp');
}

/**
 * Checks whether given value has a then function.
 * @param wat A value to be checked.
 */
export function isThenable(wat: any): wat is PromiseLike<any> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return Boolean(wat?.then && typeof wat.then === 'function');
}

/**
 * Checks whether given value's type is a React SyntheticEvent
 * {@link isSyntheticEvent}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 * @deprecated This is React-specific and will be removed from `@sentry/core` in a future major version.
 * Use the equivalent helper that ships with `@sentry/react` instead.
 */
export function isSyntheticEvent(wat: unknown): boolean {
  return isPlainObject(wat) && 'nativeEvent' in wat && 'preventDefault' in wat && 'stopPropagation' in wat;
}

/**
 * Checks whether given value's type is an instance of provided constructor.
 * {@link isInstanceOf}.
 *
 * @param wat A value to be checked.
 * @param base A constructor to be used in a check.
 * @returns A boolean representing the result.
 */
type Constructor<T> = { new (...args: never[]): T };

export function isInstanceOf<T>(wat: unknown, base: Constructor<T>): wat is T;
export function isInstanceOf(wat: unknown, base: unknown): boolean;
export function isInstanceOf<T>(wat: unknown, base: unknown): wat is T {
  try {
    return wat instanceof (base as Constructor<T>);
  } catch {
    return false;
  }
}

/**
 * Checks whether given value's type is a Vue ViewModel or a VNode.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 * @deprecated This is Vue-specific and will be removed from `@sentry/core` in a future major version.
 * Use the equivalent helper that ships with `@sentry/vue` instead.
 */
export function isVueViewModel(wat: unknown): wat is VueViewModel | VNode {
  // Not using Object.prototype.toString because in Vue 3 it would read the instance's Symbol(Symbol.toStringTag) property.
  // We also need to check for __v_isVNode because Vue 3 component render instances have an internal __v_isVNode property.
  return !!(
    typeof wat === 'object' &&
    wat !== null &&
    ((wat as VueViewModel).__isVue || (wat as VueViewModel)._isVue || (wat as { __v_isVNode?: boolean }).__v_isVNode)
  );
}

/**
 * Checks whether the given parameter is a Standard Web API Request instance.
 *
 * Returns false if Request is not available in the current runtime.
 */
export function isRequest(request: unknown): request is Request {
  return typeof Request !== 'undefined' && isInstanceOf(request, Request);
}
