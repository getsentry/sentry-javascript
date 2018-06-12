/**
 * Serializes the given object into a string.
 *
 * The object must be serializable, i.e.:
 *  - Only primitive types are allowed (object, array, number, string, boolean)
 *  - Its depth should be considerably low for performance reasons
 *
 * @param object A JSON-serializable object.
 * @returns A string containing the serialized object.
 */
export declare function serialize<T>(object: T): string;
/**
 * Deserializes an object from a string previously serialized with
 * {@link serialize}.
 *
 * @param str A serialized object.
 * @returns The deserialized object.
 */
export declare function deserialize<T>(str: string): T;
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
export declare function clone<T>(object: T): T;
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
export declare function fill(source: {
    [key: string]: any;
}, name: string, replacement: (...args: any[]) => any, track?: Array<[{
    [key: string]: any;
}, string, any]>): void;
