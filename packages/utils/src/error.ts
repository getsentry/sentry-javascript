import { setPrototypeOf } from './polyfill';

/** An error emitted by Sentry SDKs and related utilities. */
export class SentryError extends Error {
  /** Display name of this error instance. */
  public name: string;

  public constructor(public message: string) {
    super(message);

    // tslint:disable:no-unsafe-any
    this.name = new.target.prototype.constructor.name;
    setPrototypeOf(this, new.target.prototype);
  }
}
