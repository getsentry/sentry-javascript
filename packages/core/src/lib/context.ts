import { Context } from './interfaces';

export default class ContextManager {
  private data: Context = {};

  public set(next: Context): Context {
    const prev = this.get();
    this.data = { ...this.get(), ...next };
    return this.data;
  }

  public update(fn: (prev: Context) => Context): Context {
    return this.set(fn(this.get()));
  }

  public get(): Context {
    // Create an exact copy without references so people won't shoot themselves in the foot
    return JSON.parse(JSON.stringify(this.data));
  }
}
