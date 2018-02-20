import {
  Adapter,
  Breadcrumb,
  Client,
  Event,
  Options,
  Context,
} from '../../src/index';

export interface MockAdapterOptions extends Options {
  testOption?: boolean;
}

export class MockAdapter implements Adapter {
  private context: Context;

  constructor(
    client: Client,
    public options: MockAdapterOptions = { testOption: false },
  ) {
    return this;
  }

  public install(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public captureException(raw: any): Promise<Event> {
    return Promise.resolve({ message: raw.toString() });
  }

  public async captureMessage(message: string): Promise<Event> {
    if (message === 'fail') {
      throw new Error('Failed because we told it to');
    } else {
      return { message };
    }
  }

  public captureBreadcrumb(breadcrumb: Breadcrumb): Promise<Breadcrumb> {
    return Promise.resolve(breadcrumb);
  }

  public send(event: Event): Promise<void> {
    return Promise.resolve();
  }

  public wrap(fn: Function, options: object) {
    return fn;
  }

  public async setOptions(options: MockAdapterOptions) {
    return Promise.resolve(this);
  }

  public async getContext() {
    return Promise.resolve(this.context);
  }

  public async setContext(context: Context) {
    this.context = context;
    return Promise.resolve(this);
  }
}
