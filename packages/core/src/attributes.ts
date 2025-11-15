export type RawAttributes<T> = T & ValidatedAttributes<T>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawAttribute<T> = T extends { value: any } | { unit: any } ? AttributeWithUnit : T;

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

export type AttributeWithUnit = {
  value: unknown;
  unit?: Units;
};

/**
 * Unit of measurement that can be added to an attribute.
 */
type Units = 'ms' | 's' | 'bytes' | 'count' | 'percent';

/* If an attribute has either a 'value' or 'unit' property, we use the ValidAttributeObject type. */
export type ValidatedAttributes<T> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [K in keyof T]: T[K] extends { value: any } | { unit: any } ? AttributeWithUnit : unknown;
};

/**
 * Type-guard: The attribute object has the shape the official attribute object (value, type, unit).
 * https://develop.sentry.dev/sdk/telemetry/scopes/#setting-attributes
 */
export function isAttributeObject(value: unknown): value is AttributeWithUnit {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) {
    return false;
  }

  // MUST have 'value' and 'unit' property
  return Object.prototype.hasOwnProperty.call(value, 'value') && Object.prototype.hasOwnProperty.call(value, 'unit');
}

/**
 * Converts an attribute value to a typed attribute value.
 *
 * Does not allow mixed arrays. In case of a mixed array, the value is stringified and the type is 'string'.
 *
 * @param value - The value of the passed attribute.
 * @returns The typed attribute.
 */
export function attributeValueToTypedAttributeValue(rawValue: unknown): TypedAttributeValue {
  const unit = isAttributeObject(rawValue) ? rawValue.unit : undefined;
  const value = isAttributeObject(rawValue) ? rawValue.value : rawValue;

  switch (typeof value) {
    case 'number': {
      const numberType = getNumberType(value);
      if (!numberType) {
        break;
      }
      return {
        value,
        type: numberType,
        unit,
      };
    }
    case 'boolean':
      return {
        value,
        type: 'boolean',
        unit,
      };
    case 'string':
      return {
        value,
        type: 'string',
        unit,
      };
  }

  if (Array.isArray(value)) {
    const coherentType = value.reduce((acc: 'string' | 'boolean' | 'integer' | 'double' | null, item) => {
      if (!acc || getPrimitiveType(item) !== acc) {
        return null;
      }
      return acc;
    }, getPrimitiveType(value[0]));

    if (coherentType) {
      return { value, type: `${coherentType}[]`, unit };
    }
  }

  // Fallback: stringify the passed value
  let fallbackValue = '';
  try {
    fallbackValue = JSON.stringify(value) ?? String(value);
  } catch {
    try {
      fallbackValue = String(value);
    } catch {
      // ignore
    }
  }

  return {
    value: fallbackValue,
    type: 'string',
    unit,
  };
}

// Disallow NaN, differentiate between integer and double
const getNumberType: (num: number) => 'integer' | 'double' | null = item =>
  Number.isNaN(item) ? null : Number.isInteger(item) ? 'integer' : 'double';

// Only allow string, boolean, or number types
const getPrimitiveType: (item: unknown) => 'string' | 'boolean' | 'integer' | 'double' | null = item =>
  typeof item === 'string'
    ? 'string'
    : typeof item === 'boolean'
      ? 'boolean'
      : typeof item === 'number'
        ? getNumberType(item)
        : null;
