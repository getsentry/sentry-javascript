import type { ConsoleLevel } from './logger';

/** An error emitted by Sentry SDKs and related utilities. */
export class SentryError extends Error {
  /** Display name of this error instance. */
  public name: string;

  public logLevel: ConsoleLevel;

  public constructor(public message: string, logLevel: ConsoleLevel = 'warn') {
    super(message);

    this.name = new.target.prototype.constructor.name;
    // This sets the prototype to be `Error`, not `SentryError`. It's unclear why we do this, but commenting this line
    // out causes various (seemingly totally unrelated) playwright tests consistently time out. FYI, this makes
    // instances of `SentryError` fail `obj instanceof SentryError` checks.
    Object.setPrototypeOf(this, new.target.prototype);
    this.logLevel = logLevel;
  }
}
