import type { DurationUnit, FractionUnit, InformationUnit } from './types-hoist/measurement';

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
type AttributeUnit = DurationUnit | InformationUnit | FractionUnit;

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
export function attributeValueToTypedAttributeValue(rawValue: unknown): TypedAttributeValue | void {
  const { value, unit } = isAttributeObject(rawValue) ? rawValue : { value: rawValue, unit: undefined };
  const attributeValue = getTypedAttributeValue(value);
  if (attributeValue) {
    return { ...attributeValue, ...(unit && typeof unit === 'string' ? { unit } : {}) };
  }
}

/**
 * NOTE: We intentionally do not return anything for non-primitive values:
 *  - array support will come in the future but if we stringify arrays now,
 *    sending arrays (unstringified) later will be a subtle breaking change.
 *  - Objects are not supported yet and product support is still TBD.
 *  - We still keep the type signature for TypedAttributeValue wider to avoid a
 *    breaking change once we add support for non-primitive values.
 *  - Once we go back to supporting arrays and stringifying all other values,
 *    we already implemented the serialization logic here:
 *    https://github.com/getsentry/sentry-javascript/pull/18165
 */
function getTypedAttributeValue(value: unknown): TypedAttributeValue | void {
  const primitiveType =
    typeof value === 'string'
      ? 'string'
      : typeof value === 'boolean'
        ? 'boolean'
        : typeof value === 'number' && !Number.isNaN(value)
          ? Number.isInteger(value)
            ? 'integer'
            : 'double'
          : null;
  if (primitiveType) {
    // @ts-expect-error - TS complains because {@link TypedAttributeValue} is strictly typed to
    // avoid setting the wrong `type` on the attribute value.
    // In this case, getPrimitiveType already does the check but TS doesn't know that.
    // The "clean" alternative is to return an object per `typeof value` case
    // but that would require more bundle size
    // Therefore, we ignore it.
    return { value, type: primitiveType };
  }
}
