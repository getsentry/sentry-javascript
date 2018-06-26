/**
 * Just an Error object with arbitrary attributes attached to it.
 */
interface ExtendedError extends Error {
  [key: string]: any;
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
 * Serializer function used as 2nd argument to JSON.serialize in `serialize()` util function.
 */
function serializer(): (key: string, value: any) => any {
  const stack: any[] = [];
  const keys: string[] = [];
  const cycleReplacer = (_: string, value: any) => {
    if (stack[0] === value) {
      return '[Circular ~]';
    }
    return `[Circular ~.${keys.slice(0, stack.indexOf(value)).join('.')}]`;
  };

  return function(this: any, key: string, value: any): any {
    let currentValue: any = value;

    if (stack.length > 0) {
      const thisPos = stack.indexOf(this);

      if (thisPos !== -1) {
        stack.splice(thisPos + 1);
        keys.splice(thisPos, Infinity, key);
      } else {
        stack.push(this);
        keys.push(key);
      }

      if (stack.indexOf(currentValue) !== -1) {
        currentValue = cycleReplacer.call(this, key, currentValue);
      }
    } else {
      stack.push(currentValue);
    }

    return currentValue instanceof Error
      ? objectifyError(currentValue)
      : currentValue;
  };
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
  return JSON.stringify(object, serializer());
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
 * and keep track of the original within `track` array
 *
 * @param source An object that contains a method to be wrapped.
 * @param name A name of method to be wrapped.
 * @param replacement A function that should be used to wrap a given method.
 * @param [track] An array containing original methods that were wrapped.
 * @returns void
 */

export function fill(
  source: { [key: string]: any },
  name: string,
  replacement: (...args: any[]) => any,
  track?: Array<[{ [key: string]: any }, string, any]>,
): void {
  const orig = source[name];
  source[name] = replacement(orig);
  // tslint:disable-next-line:no-unsafe-any
  source[name].__raven__ = true;
  // tslint:disable-next-line:no-unsafe-any
  source[name].__orig__ = orig;
  if (track) {
    track.push([source, name, orig]);
  }
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
