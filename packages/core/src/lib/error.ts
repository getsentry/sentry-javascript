/** TODO */
export class SentryError extends Error {
  /** TODO */
  public name: string;

  /** TODO */
  public constructor(public message: string) {
    super(message);

    // tslint:disable:no-unsafe-any
    this.name = new.target.prototype.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
