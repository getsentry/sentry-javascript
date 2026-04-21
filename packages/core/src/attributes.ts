import type { DurationUnit, FractionUnit, InformationUnit } from './types-hoist/measurement';
import type { Primitive } from './types-hoist/misc';
import { isPrimitive } from './utils/is';

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
  array: Array<string> | Array<number> | Array<boolean>;
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
 * For now, we support primitive values, homogeneous arrays of primitives, and attribute objects
 * with primitive or primitive-array values. If @param useFallback is true, we stringify other
 * non-primitive values to a string attribute value. Otherwise we return `undefined` for unsupported
 * values.
 *
 * @param value - The value of the passed attribute.
 * @param useFallback - If true, unsupported values will be stringified to a string attribute value.
 *                      Defaults to false. In this case, `undefined` is returned for unsupported values.
 * @returns The typed attribute.
 */
export function attributeValueToTypedAttributeValue(
  rawValue: unknown,
  useFallback?: boolean | 'skip-undefined',
): TypedAttributeValue | void {
  const { value, unit } = isAttributeObject(rawValue) ? rawValue : { value: rawValue, unit: undefined };
  const attributeValue = getTypedAttributeValue(value);
  const checkedUnit = unit && typeof unit === 'string' ? { unit } : {};
  if (attributeValue) {
    return { ...attributeValue, ...checkedUnit };
  }

  if (!useFallback || (useFallback === 'skip-undefined' && value === undefined)) {
    return;
  }

  // Fallback: stringify the value
  // TODO(v11): be smarter here and use String constructor if stringify fails
  // (this is a breaking change for already existing attribute values)
  let stringValue = '';
  try {
    stringValue = JSON.stringify(value) ?? '';
  } catch {
    // Do nothing
  }
  return {
    value: stringValue,
    type: 'string',
    ...checkedUnit,
  };
}

/**
 * Serializes raw attributes to typed attributes as expected in our envelopes.
 *
 * @param attributes The raw attributes to serialize.
 * @param fallback   If true, unsupported values will be stringified to a string attribute value.
 *                   Defaults to false. In this case, `undefined` is returned for unsupported values.
 *
 * @returns The serialized attributes.
 */
export function serializeAttributes<T>(
  attributes: RawAttributes<T> | undefined,
  fallback: boolean | 'skip-undefined' = false,
): Attributes {
  const serializedAttributes: Attributes = {};
  for (const [key, value] of Object.entries(attributes ?? {})) {
    const typedValue = attributeValueToTypedAttributeValue(value, fallback);
    if (typedValue) {
      serializedAttributes[key] = typedValue;
    }
  }
  return serializedAttributes;
}

/**
 * Estimates the serialized byte size of {@link Attributes},
 * with a couple of heuristics for performance.
 */
export function estimateTypedAttributesSizeInBytes(attributes: Attributes | undefined): number {
  if (!attributes) {
    return 0;
  }
  let weight = 0;
  for (const [key, attr] of Object.entries(attributes)) {
    weight += key.length * 2;
    weight += attr.type.length * 2;
    weight += (attr.unit?.length ?? 0) * 2;
    const val = attr.value;

    if (Array.isArray(val)) {
      // Assumption: Individual array items have the same type and roughly the same size
      // probably not always true but allows us to cut down on runtime
      weight += estimatePrimitiveSizeInBytes(val[0]) * val.length;
    } else if (isPrimitive(val)) {
      weight += estimatePrimitiveSizeInBytes(val);
    } else {
      // default fallback for anything else (objects)
      weight += 100;
    }
  }
  return weight;
}

function estimatePrimitiveSizeInBytes(value: Primitive): number {
  if (typeof value === 'string') {
    return value.length * 2;
  } else if (typeof value === 'boolean') {
    return 4;
  } else if (typeof value === 'number') {
    return 8;
  }
  return 0;
}

/**
 * NOTE: We return typed attributes for primitives and homogeneous arrays of primitives:
 *  - Homogeneous primitive arrays ship with `type: 'array'` (Relay's wire tag for arrays).
 *  - Mixed-type and nested arrays are not supported and return undefined.
 *  - Objects are not supported yet and product support is still TBD.
 *  - We still keep the type signature for TypedAttributeValue wider to avoid a
 *    breaking change once we add support for other non-primitive values.
 */
function getTypedAttributeValue(value: unknown): TypedAttributeValue | void {
  if (Array.isArray(value) && isHomogeneousPrimitiveArray(value)) {
    return { value, type: 'array' };
  }

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

function isHomogeneousPrimitiveArray(arr: unknown[]): boolean {
  if (arr.length === 0) return true;
  const t = typeof arr[0];
  if (t !== 'string' && t !== 'number' && t !== 'boolean') return false;
  return arr.every(v => typeof v === t);
}
