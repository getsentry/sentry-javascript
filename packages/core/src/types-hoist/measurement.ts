// Based on https://getsentry.github.io/relay/relay_metrics/enum.MetricUnit.html
// For more details, see measurement key in https://develop.sentry.dev/sdk/event-payloads/transaction/

/**
 * A time duration.
 */
export type DurationUnit = 'nanosecond' | 'microsecond' | 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week';

/**
 * Size of information derived from bytes.
 */
export type InformationUnit =
  | 'bit'
  | 'byte'
  | 'kilobyte'
  | 'kibibyte'
  | 'megabyte'
  | 'mebibyte'
  | 'gigabyte'
  | 'gibibyte'
  | 'terabyte'
  | 'tebibyte'
  | 'petabyte'
  | 'pebibyte'
  | 'exabyte'
  | 'exbibyte';

/**
 * Fractions such as percentages.
 */
export type FractionUnit = 'ratio' | 'percent';

/**
 * Untyped value without a unit.
 */
export type NoneUnit = '' | 'none';

// See https://github.com/microsoft/TypeScript/issues/29729#issuecomment-1082546550
// Needed to make sure auto-complete will work for the string union type while still
// allowing for arbitrary strings as custom units (user-defined units without builtin conversion or default).
type LiteralUnion<T extends string> = T | Omit<T, T>;

export type MeasurementUnit = LiteralUnion<DurationUnit | InformationUnit | FractionUnit | NoneUnit>;

export type Measurements = Record<string, { value: number; unit: MeasurementUnit }>;
