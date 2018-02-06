import {Context as ContextInterface} from './interfaces';

export class Context {
  private data: ContextInterface;

  public clear() {
    Object.keys(this.data).forEach((key: keyof ContextInterface) => {
      delete this.data[key];
    });
  }

  public set(context: ContextInterface) {
    this.data = Object.assign({}, context);
  }

  public get<ContextInterface>() {
    return this.data;
  }

  public merge(context: ContextInterface) {
    Object.assign(this.data, context);
  }
}
