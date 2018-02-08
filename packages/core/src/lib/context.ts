import { Context as ContextInterface } from './interfaces';

// ADD JSDOCS

export interface UpdateContext {
  (prevContext: ContextInterface): ContextInterface;
}

export class Context {
  private data: ContextInterface = {};

  public set(nextContext: ContextInterface | UpdateContext): ContextInterface {
    const prevContext = this.get();

    if (typeof nextContext === 'function') {
      this.data = Object.assign({}, prevContext, nextContext(this.get()));
    } else {
      this.data = Object.assign({}, prevContext, nextContext);
    }

    return this.data;
  }

  public get(): ContextInterface {
    // Create an exact copy without references so people won't shoot themselves in the foot
    return JSON.parse(JSON.stringify(this.data));
  }
}
