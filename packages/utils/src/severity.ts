import { Severity, SeverityLevel } from '@sentry/types';

// Note: Ideally the `SeverityLevel` type would be derived from `validSeverityLevels`, but that would mean either
//
// a) moving `validSeverityLevels` to `@sentry/types`,
// b) moving the`SeverityLevel` type here, or
// c) importing `validSeverityLevels` from here into `@sentry/types`.
//
// Option A would make `@sentry/types` a runtime dependency of `@sentry/utils` (not good), and options B and C would
// create a circular dependency between `@sentry/types` and `@sentry/utils` (also not good). So a TODO accompanying the
// type, reminding anyone who changes it to change this list also, will have to do.

export const validSeverityLevels = ['fatal', 'error', 'warning', 'log', 'info', 'debug', 'critical'];

/**
 * Converts a string-based level into a member of the {@link Severity} enum.
 *
 * @param level String representation of Severity
 * @returns Severity
 */
export function severityFromString(level: SeverityLevel | string): Severity {
  return (level === 'warn' ? Severity.Warning : validSeverityLevels.includes(level) ? level : Severity.Log) as Severity;
}

/**
 * Converts a string-based level into a `SeverityLevel`, normalizing it along the way.
 *
 * @param level String representation of desired `SeverityLevel`.
 * @returns The `SeverityLevel` corresponding to the given string, or 'log' if the string isn't a valid level.
 */
export function severityLevelFromString(level: SeverityLevel | string): SeverityLevel {
  return (level === 'warn' ? 'warning' : validSeverityLevels.includes(level) ? level : 'log') as SeverityLevel;
}
