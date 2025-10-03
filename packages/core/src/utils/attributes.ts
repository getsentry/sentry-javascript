import { normalize } from '..';
import type { SerializedAttribute } from '../types-hoist/attributes';
import { Primitive } from '../types-hoist/misc';
import type { SpanAttributes, SpanAttributeValue } from '../types-hoist/span';
import { isPrimitive } from './is';

/**
 * Converts an attribute value to a serialized attribute value object, containing
 * a type descriptor as well as the value.
 *
 * TODO: dedupe this with the logs version of the function (didn't do this yet to avoid
 * dependance on logs/spans for the open questions RE array and object attribute types)
 *
 * @param value - The value of the log attribute.
 * @returns The serialized log attribute.
 */
export function attributeValueToSerializedAttribute(value: unknown): SerializedAttribute {
  switch (typeof value) {
    case 'number':
      if (Number.isInteger(value)) {
        return {
          value,
          type: 'integer',
        };
      }
      return {
        value,
        type: 'double',
      };
    case 'boolean':
      return {
        value,
        type: 'boolean',
      };
    case 'string':
      return {
        value,
        type: 'string',
      };
    default: {
      let stringValue = '';
      try {
        stringValue = JSON.stringify(value) ?? '';
      } catch {
        // Do nothing
      }
      return {
        value: stringValue,
        type: 'string',
      };
    }
  }
}

/**
 * Given an object that might contain keys with primitive, array, or object values,
 * return a SpanAttributes object that flattens the object into a single level.
 * - Nested keys are separated by '.'.
 * - arrays are stringified (TODO: might change, depending on how we support array attributes)
 * - objects are flattened
 * - primitives are added directly
 * - nullish values are ignored
 * - maxDepth is the maximum depth to flatten the object to
 *
 * @param obj - The object to flatten into span attributes
 * @returns The span attribute object
 */
export function attributesFromObject(obj: Record<string, unknown>, maxDepth = 3): SpanAttributes {
  const result: Record<string, number | string | boolean | undefined> = {};

  function primitiveOrToString(current: unknown): number | boolean | string {
    if (typeof current === 'number' || typeof current === 'boolean' || typeof current === 'string') {
      return current;
    }
    return String(current);
  }

  function flatten(current: unknown, prefix: string, depth: number): void {
    if (current == null) {
      return;
    } else if (depth >= maxDepth) {
      result[prefix] = primitiveOrToString(current);
      return;
    } else if (Array.isArray(current)) {
      result[prefix] = JSON.stringify(current);
    } else if (typeof current === 'number' || typeof current === 'string' || typeof current === 'boolean') {
      result[prefix] = current;
    } else if (typeof current === 'object' && current !== null && !Array.isArray(current) && depth < maxDepth) {
      for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
        flatten(value, prefix ? `${prefix}.${key}` : key, depth + 1);
      }
    }
  }

  const normalizedObj = normalize(obj, maxDepth);

  flatten(normalizedObj, '', 0);

  return result;
}
