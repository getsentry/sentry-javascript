import type { SeverityLevel } from '../types-hoist/severity';

/**
 * Converts a string-based level into a `SeverityLevel`, normalizing it along the way.
 *
 * @param level String representation of desired `SeverityLevel`.
 * @returns The `SeverityLevel` corresponding to the given string, or 'log' if the string isn't a valid level.
 */
export function severityLevelFromString(level: SeverityLevel | string): SeverityLevel {
  return (
    level === 'warn' ? 'warning' : ['fatal', 'error', 'warning', 'log', 'info', 'debug'].includes(level) ? level : 'log'
  ) as SeverityLevel;
}
