import type { SerializedAttribute } from '../types-hoist/attributes';

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
