"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
function serialize(object) {
    // TODO: Fix cyclic and deep objects
    return JSON.stringify(object);
}
exports.serialize = serialize;
/**
 * Deserializes an object from a string previously serialized with
 * {@link serialize}.
 *
 * @param str A serialized object.
 * @returns The deserialized object.
 */
function deserialize(str) {
    // TODO: Handle recursion stubs from serialize
    return JSON.parse(str);
}
exports.deserialize = deserialize;
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
function clone(object) {
    return deserialize(serialize(object));
}
exports.clone = clone;
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
function fill(source, name, replacement, track) {
    var orig = source[name];
    source[name] = replacement(orig);
    // tslint:disable:no-unsafe-any
    source[name].__raven__ = true;
    // tslint:disable:no-unsafe-any
    source[name].__orig__ = orig;
    if (track) {
        track.push([source, name, orig]);
    }
}
exports.fill = fill;
//# sourceMappingURL=object.js.map