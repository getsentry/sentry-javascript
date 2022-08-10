import type { ConsoleLevel } from './logger';

/** An error emitted by Sentry SDKs and related utilities. */
export class SentryError extends Error {
  /** Display name of this error instance. */
  public name: string;

  public logLevel: ConsoleLevel;

  public constructor(public message: string, logLevel: ConsoleLevel = 'warn') {
    super(message);

    this.name = new.target.prototype.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
    this.logLevel = logLevel;
  }
}
