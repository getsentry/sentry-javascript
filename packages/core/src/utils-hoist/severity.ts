import type { SeverityLevel } from '@sentry/types';

// Note: Ideally the `SeverityLevel` type would be derived from `validSeverityLevels`, but that would mean either
//
// a) moving `validSeverityLevels` to `@sentry/types`,
// b) moving the`SeverityLevel` type here, or
// c) importing `validSeverityLevels` from here into `@sentry/types`.
//
// Option A would make `@sentry/types` a runtime dependency of `@sentry/core` (not good), and options B and C would
// create a circular dependency between `@sentry/types` and `@sentry/core` (also not good). So a TODO accompanying the
// type, reminding anyone who changes it to change this list also, will have to do.

export const validSeverityLevels = ['fatal', 'error', 'warning', 'log', 'info', 'debug'];

/**
 * Converts a string-based level into a `SeverityLevel`, normalizing it along the way.
 *
 * @param level String representation of desired `SeverityLevel`.
 * @returns The `SeverityLevel` corresponding to the given string, or 'log' if the string isn't a valid level.
 */
export function severityLevelFromString(level: SeverityLevel | string): SeverityLevel {
  return (level === 'warn' ? 'warning' : validSeverityLevels.includes(level) ? level : 'log') as SeverityLevel;
}
