/**
 * Checks whether given value's type is one of a few Error or Error-like
 * {@link isError}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isError(wat: any): boolean {
  switch (Object.prototype.toString.call(wat)) {
    case '[object Error]':
      return true;
    case '[object Exception]':
      return true;
    case '[object DOMException]':
      return true;
    default:
      return wat instanceof Error;
  }
}

/**
 * Checks whether given value's type is ErrorEvent
 * {@link isErrorEvent}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isErrorEvent(wat: any): boolean {
  return Object.prototype.toString.call(wat) === '[object ErrorEvent]';
}

/**
 * Checks whether given value's type is DOMError
 * {@link isDOMError}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isDOMError(wat: any): boolean {
  return Object.prototype.toString.call(wat) === '[object DOMError]';
}

/**
 * Checks whether given value's type is DOMException
 * {@link isDOMException}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isDOMException(wat: any): boolean {
  return Object.prototype.toString.call(wat) === '[object DOMException]';
}

/**
 * Checks whether given value's type is an undefined
 * {@link isUndefined}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isUndefined(wat: any): boolean {
  return wat === void 0;
}

/**
 * Checks whether given value's type is a function
 * {@link isFunction}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isFunction(wat: any): boolean {
  return typeof wat === 'function';
}

/**
 * Checks whether given value's type is a string
 * {@link isString}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isString(wat: any): boolean {
  return Object.prototype.toString.call(wat) === '[object String]';
}

/**
 * Checks whether given value's is a primitive (undefined, null, number, boolean, string)
 * {@link isPrimitive}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isPrimitive(wat: any): boolean {
  return wat === null || (typeof wat !== 'object' && typeof wat !== 'function');
}

/**
 * Checks whether given value's type is an array
 * {@link isArray}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isArray(wat: any): boolean {
  return Object.prototype.toString.call(wat) === '[object Array]';
}

/**
 * Checks whether given value's type is an object literal
 * {@link isPlainObject}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isPlainObject(wat: any): boolean {
  return Object.prototype.toString.call(wat) === '[object Object]';
}

/**
 * Checks whether given value's type is an regexp
 * {@link isRegExp}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isRegExp(wat: any): boolean {
  return Object.prototype.toString.call(wat) === '[object RegExp]';
}

/**
 * Checks whether given value's type is a NaN
 * {@link isNaN}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
export function isNaN(wat: any): boolean {
  return wat !== wat;
}
