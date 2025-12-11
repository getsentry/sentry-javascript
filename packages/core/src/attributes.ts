import { DEBUG_BUILD } from './debug-build';
import type { DurationUnit, FractionUnit, InformationUnit } from './types-hoist/measurement';
import { debug } from './utils/debug-logger';

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

export type TypedAttributeValue = AttributeUnion & { unit?: AttributeUnit };

export type AttributeObject = {
  value: unknown;
  unit?: AttributeUnit;
};

// Unfortunately, we loose type safety if we did something like Exclude<MeasurementUnit, string>
// so therefore we unionize between the three supported unit categories.
export type AttributeUnit = DurationUnit | InformationUnit | FractionUnit;

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

// Only allow string, boolean, or number types
const getPrimitiveType: (
  item: unknown,
) => keyof Pick<AttributeTypeMap, 'string' | 'integer' | 'double' | 'boolean'> | null = item =>
  typeof item === 'string'
    ? 'string'
    : typeof item === 'boolean'
      ? 'boolean'
      : typeof item === 'number' && !Number.isNaN(item)
        ? Number.isInteger(item)
          ? 'integer'
          : 'double'
        : null;

function getTypedAttributeValue(value: unknown): TypedAttributeValue {
  const primitiveType = getPrimitiveType(value);
  if (primitiveType) {
    // @ts-expect-error - TS complains because {@link TypedAttributeValue} is strictly typed to
    // avoid setting the wrong `type` on the attribute value.
    // In this case, getPrimitiveType already does the check but TS doesn't know that.
    // The "clean" alternative is to return an object per `typeof value` case
    // but that would require more bundle size
    // Therefore, we ignore it.
    return { value, type: primitiveType };
  }

  if (Array.isArray(value)) {
    const coherentArrayType = value.reduce((acc: 'string' | 'boolean' | 'integer' | 'double' | null, item) => {
      if (!acc || getPrimitiveType(item) !== acc) {
        return null;
      }
      return acc;
    }, getPrimitiveType(value[0]));

    if (coherentArrayType) {
      return { value, type: `${coherentArrayType}[]` };
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
      DEBUG_BUILD && debug.warn('Failed to stringify attribute value', value);
      // ignore
    }
  }

  // This is quite a low-quality message but we cannot safely log the original `value`
  // here due to String() or JSON.stringify() potentially throwing.
  DEBUG_BUILD &&
    debug.log(`Stringified attribute value to ${fallbackValue} because it's not a supported attribute value type`);

  return {
    value: fallbackValue,
    type: 'string',
  };
}
