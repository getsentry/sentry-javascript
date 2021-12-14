/** JSDoc
 * @deprecated Use string literals - if you require type casting, cast to SeverityLevel type
 */
// eslint-disable-next-line import/export
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

const levels = ['fatal', 'error', 'warning', 'log', 'info', 'debug', 'critical'] as const;
export type SeverityLevel = typeof levels[number];

// eslint-disable-next-line @typescript-eslint/no-namespace, import/export
export namespace Severity {
  /**
   * Converts a string-based level into a {@link Severity}.
   *
   * @param level string representation of Severity
   * @returns Severity
   */
  export function fromString(level: SeverityLevel | string): SeverityLevel {
    if (level === 'warn') return 'warning';
    if (levels.indexOf(level as SeverityLevel) === -1) {
      return 'log';
    }
    return level as SeverityLevel;
  }
}
