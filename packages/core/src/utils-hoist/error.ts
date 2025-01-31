import type { ConsoleLevel } from '../types-hoist';

/** An error emitted by Sentry SDKs and related utilities. */
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
