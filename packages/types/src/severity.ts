/**
 * Levels are used in the UI to emphasize and deemphasize the crumb.
 */
// eslint-disable-next-line import/export
export enum Severity {
  /**
   * Debug level.
   */
  Debug = 'debug',

  /**
   * Info level.
   */
  Info = 'info',

  /**
   * Warning level.
   */
  Warning = 'warning',

  /**
   * Error level.
   */
  Error = 'error',

  /**
   * Fatal level.
   */
  Fatal = 'fatal',

  Log = 'log',
  Critical = 'critical',
}

// eslint-disable-next-line @typescript-eslint/no-namespace, import/export
export namespace Severity {
  /**
   * Converts a string-based level into a {@link Severity}.
   *
   * @param level string representation of Severity
   * @returns Severity
   */
  export function fromString(level: string): Severity {
    switch (level) {
      case 'debug':
        return Severity.Debug;
      case 'info':
        return Severity.Info;
      case 'warn':
      case 'warning':
        return Severity.Warning;
      case 'error':
        return Severity.Error;
      case 'fatal':
        return Severity.Fatal;
      case 'critical':
        return Severity.Critical;
      case 'log':
      default:
        return Severity.Log;
    }
  }
}
