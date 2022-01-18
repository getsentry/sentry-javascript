import { Severity, SeverityLevel, SeverityLevels } from '@sentry/types';

function isSupportedSeverity(level: string): level is Severity {
  return SeverityLevels.indexOf(level as SeverityLevel) !== -1;
}
/**
 * Converts a string-based level into a {@link Severity}.
 *
 * @param level string representation of Severity
 * @returns Severity
 */
export function severityFromString(level: SeverityLevel | string): Severity {
  if (level === 'warn') return Severity.Warning;
  if (isSupportedSeverity(level)) {
    return level;
  }
  return Severity.Log;
}
