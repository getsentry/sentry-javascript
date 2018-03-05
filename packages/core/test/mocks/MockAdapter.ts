import Client, { Adapter, Options } from '../../src/lib/client';
import { Breadcrumb, Context, SentryEvent } from '../../src/lib/interfaces';

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

  public captureException(raw: any): Promise<SentryEvent> {
    return Promise.resolve({ message: raw.toString() });
  }

  public async captureMessage(message: string): Promise<SentryEvent> {
    if (message === 'fail') {
      throw new Error('Failed because we told it to');
    } else {
      return { message };
    }
  }

  public captureBreadcrumb(breadcrumb: Breadcrumb): Promise<Breadcrumb> {
    return Promise.resolve(breadcrumb);
  }

  public send(event: SentryEvent): Promise<void> {
    return Promise.resolve();
  }

  public wrap(fn: () => void, options: object): () => void {
    return fn;
  }

  public async setOptions(options: MockAdapterOptions): Promise<void> {
    return Promise.resolve();
  }

  public async getContext(): Promise<Context> {
    return Promise.resolve(this.context);
  }

  public async setContext(context: Context): Promise<void> {
    this.context = context;
    return Promise.resolve();
  }
}
