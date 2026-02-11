import type { LogSeverityLevel } from '../types-hoist/log';

/**
 * Maps a log severity level to a log severity number.
 *
 * @see LogSeverityLevel
 */
export const SEVERITY_TEXT_TO_SEVERITY_NUMBER: Partial<Record<LogSeverityLevel, number>> = {
  trace: 1,
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
  fatal: 21,
};
