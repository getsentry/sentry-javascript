import { Severity, SeverityLevel } from '@sentry/types';

export const validSeverityLevels = ['fatal', 'error', 'warning', 'log', 'info', 'debug', 'critical'];

/**
 * Converts a string-based level into a {@link Severity}.
 *
 * @param level string representation of Severity
 * @returns Severity
 */
export function severityFromString(level: SeverityLevel | string): Severity {
  return (level === 'warn' ? Severity.Warning : validSeverityLevels.includes(level) ? level : Severity.Log) as Severity;
}
