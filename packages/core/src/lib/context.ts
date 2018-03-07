import { Context } from './domain';

/** TODO */
export class ContextManager {
  /** TODO */
  private data: Context = {};

  /** TODO */
  public set(next: Context): Context {
    this.data = { ...this.get(), ...next };
    return this.data;
  }

  /** TODO */
  public update(fn: (prev: Context) => Context): Context {
    return this.set(fn(this.get()));
  }

  /** TODO */
  public get(): Context {
    // Create an exact copy without references so people won't shoot themselves in the foot
    return JSON.parse(JSON.stringify(this.data)) as Context;
  }
}
