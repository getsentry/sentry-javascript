/**
 * @deprecated Please use a `SeverityLevel` string instead of the `Severity` enum. Acceptable values are 'fatal',
 * 'error', 'warning', 'log', 'info', and 'debug'.
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
}

// Note: If this is ever changed, the `validSeverityLevels` array in `@sentry/utils` needs to be changed, also. (See
// note there for why we can't derive one from the other.)
export type SeverityLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';
