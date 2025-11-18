export type RawAttributes<T> = T & ValidatedAttributes<T>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawAttribute<T> = T extends { value: any } | { unit: any } ? AttributeObject : T;

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

export type AttributeObject = {
  value: unknown;
  unit?: Units;
};

/**
 * Unit of measurement that can be added to an attribute.
 */
type Units = 'ms' | 's' | 'bytes' | 'count' | 'percent' | string;

/* If an attribute has either a 'value' or 'unit' property, we use the ValidAttributeObject type. */
export type ValidatedAttributes<T> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [K in keyof T]: T[K] extends { value: any } | { unit: any } ? AttributeObject : unknown;
};

/**
 * Type-guard: The attribute object has the shape the official attribute object (value, type, unit).
 * https://develop.sentry.dev/sdk/telemetry/scopes/#setting-attributes
 */
export function isAttributeObject(maybeObj: unknown): maybeObj is AttributeObject {
  return (
    typeof maybeObj === 'object' &&
    maybeObj != null &&
    !Array.isArray(maybeObj) &&
    Object.keys(maybeObj).includes('value')
  );
}

/**
 * Converts an attribute value to a typed attribute value.
 *
 * Does not allow mixed arrays. In case of a mixed array, the value is stringified and the type is 'string'.
 * All values besides the supported attribute types (see {@link AttributeTypeMap}) are stringified to a string attribute value.
 *
 * @param value - The value of the passed attribute.
 * @returns The typed attribute.
 */
export function attributeValueToTypedAttributeValue(rawValue: unknown): TypedAttributeValue {
  const { value, unit } = isAttributeObject(rawValue) ? rawValue : { value: rawValue, unit: undefined };
  return { ...getTypedAttributeValue(value), ...(unit && typeof unit === 'string' ? { unit } : {}) };
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

function getTypedAttributeValue(val: unknown): TypedAttributeValue {
  switch (typeof val) {
    case 'number': {
      const numberType = getNumberType(val);
      if (!numberType) {
        break;
      }
      return {
        value: val,
        type: numberType,
      };
    }
    case 'boolean':
      return {
        value: val,
        type: 'boolean',
      };
    case 'string':
      return {
        value: val,
        type: 'string',
      };
  }

  if (Array.isArray(val)) {
    const coherentType = val.reduce((acc: 'string' | 'boolean' | 'integer' | 'double' | null, item) => {
      if (!acc || getPrimitiveType(item) !== acc) {
        return null;
      }
      return acc;
    }, getPrimitiveType(val[0]));

    if (coherentType) {
      return { value: val, type: `${coherentType}[]` };
    }
  }

  // Fallback: stringify the passed value
  let fallbackValue = '';
  try {
    fallbackValue = JSON.stringify(val) ?? String(val);
  } catch {
    try {
      fallbackValue = String(val);
    } catch {
      // ignore
    }
  }

  return {
    value: fallbackValue,
    type: 'string',
  };
}
