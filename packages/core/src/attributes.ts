export type Attributes = Record<string, TypedAttributeValue>;

export type AttributeValueType = string | number | boolean | Array<string> | Array<number> | Array<boolean>;

export type TypedAttributeValue = (
  | {
      value: string;
      type: 'string';
    }
  | {
      value: number;
      type: 'integer';
    }
  | {
      value: number;
      type: 'double';
    }
  | {
      value: boolean;
      type: 'boolean';
    }
  | {
      value: Array<string>;
      type: 'string[]';
    }
  | {
      value: Array<number>;
      type: 'integer[]';
    }
  | {
      value: Array<number>;
      type: 'double[]';
    }
  | {
      value: Array<boolean>;
      type: 'boolean[]';
    }
) & { unit?: Units };

type Units = 'ms' | 's' | 'bytes' | 'count' | 'percent';

/**
 * Converts an attribute value to a typed attribute value.
 *
 * Does not allow mixed arrays. In case of a mixed array, the value is stringified and the type is 'string'.
 *
 * @param value - The value of the passed attribute.
 * @returns The typed attribute.
 */
export function attributeValueToTypedAttributeValue(value: AttributeValueType): TypedAttributeValue {
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
  }

  if (Array.isArray(value)) {
    if (value.every(item => typeof item === 'string')) {
      return {
        value,
        type: 'string[]',
      };
    }
    if (value.every(item => typeof item === 'number')) {
      if (value.every(item => Number.isInteger(item))) {
        return {
          value,
          type: 'integer[]',
        };
      } else if (value.every(item => !Number.isInteger(item))) {
        return {
          value,
          type: 'double[]',
        };
      }
    }
    if (value.every(item => typeof item === 'boolean')) {
      return {
        value,
        type: 'boolean[]',
      };
    }
  }

  // Fallback: stringify the passed value
  return {
    value: JSON.stringify(value),
    type: 'string',
  };
}
