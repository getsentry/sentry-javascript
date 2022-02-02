/**
 * TODO(v7): Remove this enum and replace with SeverityLevel
 */
export enum Severity {
  /** JSDoc */
  Fatal = 'fatal',
  /** JSDoc */
  Error = 'error',
  /** JSDoc */
  Warning = 'warning',
  /** JSDoc */
  Log = 'log',
  /** JSDoc */
  Info = 'info',
  /** JSDoc */
  Debug = 'debug',
  /** JSDoc */
  Critical = 'critical',
}

// TODO: in v7, these can disappear, because they now also exist in `@sentry/utils`. (Having them there rather than here
// is nice because then it enforces the idea that only types are exported from `@sentry/types`.)
export const SeverityLevels = ['fatal', 'error', 'warning', 'log', 'info', 'debug', 'critical'] as const;
export type SeverityLevel = typeof SeverityLevels[number];
