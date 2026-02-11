import type { ConsoleLevel } from '../types-hoist/instrument';

/**
 * An error emitted by Sentry SDKs and related utilities.
 * @deprecated This class is no longer used and will be removed in a future version. Use `Error` instead.
 */
export class SentryError extends Error {
  public logLevel: ConsoleLevel;

  public constructor(
    public message: string,
    logLevel: ConsoleLevel = 'warn',
  ) {
    super(message);

    this.logLevel = logLevel;
  }
}
