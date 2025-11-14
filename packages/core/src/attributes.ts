export type Attributes = Record<string, TypedAttributeValue>;

export type AttributeValueType = string | number | boolean | Array<string> | Array<number> | Array<boolean>;

type AttributeTypeMap = {
  string: string;
  integer: number;
  double: number;
  boolean: boolean;
  'string[]': Array<string>;
  'integer[]': Array<number>;
  'double[]': Array<number>;
  'boolean[]': Array<boolean>;
};

/* Generates a type from the AttributeTypeMap like:
  | { value: string; type: 'string' }
  | { value: number; type: 'integer' }
  | { value: number; type: 'double' }
 */
type AttributeUnion = {
  [K in keyof AttributeTypeMap]: {
    value: AttributeTypeMap[K];
    type: K;
  };
}[keyof AttributeTypeMap];

export type TypedAttributeValue = AttributeUnion & { unit?: Units };

type AttributeWithUnit = {
  value: unknown;
  unit: Units;
};

type Units = 'ms' | 's' | 'bytes' | 'count' | 'percent';

type ValidAttributeObject = AttributeWithUnit | TypedAttributeValue;

/* If an attribute has either a 'value' or 'unit' property, we use the ValidAttributeObject type. */
export type ValidatedAttributes<T> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [K in keyof T]: T[K] extends { value: any } | { unit: any } ? ValidAttributeObject : unknown;
};

/**
 * Type-guard: The attribute object has the shape the official attribute object (value, type, unit).
 * https://develop.sentry.dev/sdk/telemetry/scopes/#setting-attributes
 */
export function isAttributeObject(value: unknown): value is ValidAttributeObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  // MUST have a 'value' property
  if (!Object.prototype.hasOwnProperty.call(value, 'value')) {
    return false;
  }
  // And it MUST have 'unit' OR 'type'
  const hasUnit = Object.prototype.hasOwnProperty.call(value, 'unit');
  const hasType = Object.prototype.hasOwnProperty.call(value, 'type');

  return hasUnit || hasType;
}

/**
 * Converts an attribute value to a typed attribute value.
 *
 * Does not allow mixed arrays. In case of a mixed array, the value is stringified and the type is 'string'.
 *
 * @param value - The value of the passed attribute.
 * @returns The typed attribute.
 */
export function attributeValueToTypedAttributeValue(value: unknown): TypedAttributeValue {
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
